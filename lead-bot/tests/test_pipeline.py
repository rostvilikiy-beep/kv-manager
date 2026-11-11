import time

import pytest

from leadbot.classifier import Verdict
from leadbot.db import DB
from leadbot.pipeline import Incoming, Pipeline

TEXT = "Нужен сайт для кофейни, бюджет 30к, пишите @coffee_owner"


def verdict(**kw):
    d = dict(is_relevant=True, confidence=90, kind="order", category="site",
             title="Ищут разработчика сайта для кофейни", summary="Сайт для кофейни.",
             experience=None, work_format="unknown", budget="30к", deadline=None)
    d.update(kw)
    return Verdict(**d)


class FakeAI:
    def __init__(self, v):
        self.v, self.calls = v, 0

    async def classify(self, text):
        self.calls += 1
        return self.v


@pytest.fixture
async def db(tmp_path):
    d = DB(str(tmp_path / "t.sqlite3"))
    await d.open()
    await d.ensure_user(1, "pro")
    await d.add_pro_days(1, 30)
    await d.ensure_user(2, "free")
    yield d
    await d.close()


def make(db, ai, sent):
    async def send(u, lead, match):
        sent.append((u.id, lead, match))
    return Pipeline(db, ai, send, dedup_hours=48, free_delay_hours=4, admin_ids=set())


async def test_pro_instant_free_delayed(db):
    sent = []
    p = make(db, FakeAI(verdict()), sent)
    assert await p.process(Incoming("telegram", TEXT, chat_id=-100)) == 2
    assert [u for u, *_ in sent] == [1]          # Pro — сразу
    await db.conn.execute("UPDATE deliveries SET due_ts=?", (int(time.time()) - 1,))
    await p.flush()
    assert sorted(u for u, *_ in sent) == [1, 2]  # бесплатный — после задержки


async def test_ai_rejects(db):
    sent = []
    p = make(db, FakeAI(verdict(is_relevant=False)), sent)
    assert await p.process(Incoming("telegram", TEXT)) == 0


async def test_ai_off_user_still_gets(db):
    await db.update(2, ai_filter=False)
    sent = []
    p = make(db, FakeAI(verdict(is_relevant=False)), sent)
    assert await p.process(Incoming("telegram", TEXT)) == 1


async def test_kind_and_format_prefs(db):
    await db.update(1, kinds=["order"])
    await db.update(2, formats=["remote"])
    sent = []
    p = make(db, FakeAI(verdict(kind="job", work_format="office")), sent)
    assert await p.process(Incoming("telegram", TEXT)) == 0


async def test_lang_and_source_prefs(db):
    await db.update(1, langs=["uk"])
    await db.update(2, sources=["threads"])
    sent = []
    p = make(db, FakeAI(verdict()), sent)
    assert await p.process(Incoming("telegram", TEXT)) == 0


async def test_dedup(db):
    ai = FakeAI(verdict())
    p = make(db, ai, [])
    await p.process(Incoming("telegram", TEXT))
    assert await p.process(Incoming("telegram", TEXT.upper() + "!")) == 0
    assert ai.calls == 1


async def test_personal_group_only_for_owner(db):
    await db.add_chat(-555, 2, "Моя группа")
    p = make(db, FakeAI(verdict()), [])
    assert await p.process(Incoming("telegram", TEXT, chat_id=-555)) == 1
    d = await db.delivery(2, 1)
    assert d is not None and await db.delivery(1, 1) is None


async def test_contact_limit(db):
    for i in range(5):
        assert await db.use_contact(2, 5) == i + 1
    assert await db.use_contact(2, 5) is None


async def test_card_render(db):
    from leadbot.config import load
    from leadbot.ui import ctx
    from leadbot.ui.cards import render_card
    ctx.cfg, ctx.db = load(), db
    sent = []
    p = make(db, FakeAI(verdict()), sent)
    await p.process(Incoming("threads", TEXT, url="https://threads.net/p/1"))
    u, lead, match = sent[0]
    pro_user = await db.get_user(1)
    text, kb = render_card(pro_user, lead, match)
    assert "Ищут разработчика сайта для кофейни" in text
    assert "Источник:</b> Threads" in text and "Сфера:</b> Сайты" in text
    assert "coffee_owner" not in text            # контакты скрыты
    assert "бесплатном тарифе" not in text
    assert kb.inline_keyboard[0][0].text == "Открыть контакты 🔑"

    free_user = await db.get_user(2)
    text, kb = render_card(free_user, lead, match)
    assert "бесплатном тарифе" in text
    assert kb.inline_keyboard[0][0].text.startswith("[0/5]")
