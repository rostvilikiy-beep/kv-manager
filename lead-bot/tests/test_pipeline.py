import pytest

from leadbot.classifier import Verdict
from leadbot.db import DB
from leadbot.pipeline import Incoming, Pipeline


class FakeAI:
    def __init__(self, is_lead):
        self.is_lead, self.calls = is_lead, 0

    async def classify(self, text):
        self.calls += 1
        return Verdict(self.is_lead, 90, "site", "сайт для кофейни", "30к", None, "ок")


@pytest.fixture
async def db(tmp_path):
    d = DB(str(tmp_path / "t.sqlite3"))
    await d.open()
    await d.ensure_user(1, "a")
    await d.ensure_user(2, "b")
    await d.set_flag(2, "ai_filter", False)
    yield d
    await d.close()


async def run(db, ai, text="Нужен сайт для кофейни, бюджет 30к"):
    sent = []

    async def notify(u, lead):
        sent.append((u.id, lead))

    p = Pipeline(db, ai, notify, dedup_hours=48)
    n = await p.process(Incoming("telegram", text, chat="Фриланс", author="@x"))
    return n, sent, p


async def test_delivers_to_all(db):
    ai = FakeAI(True)
    n, sent, _ = await run(db, ai)
    assert n == 2 and ai.calls == 1
    assert sent[0][1].verdict.budget == "30к"


async def test_ai_rejects_only_for_ai_users(db):
    n, sent, _ = await run(db, FakeAI(False))
    assert [u for u, _ in sent] == [2]


async def test_dedup(db):
    ai = FakeAI(True)
    await run(db, ai)
    n, _, _ = await run(db, ai, "нужен сайт для кофейни — бюджет 30к!")
    assert n == 0 and ai.calls == 1


async def test_paused_and_source(db):
    await db.set_flag(1, "active", False)
    await db.set_flag(2, "src_telegram", False)
    n, _, _ = await run(db, FakeAI(True))
    assert n == 0


async def test_render_card(db):
    from leadbot.bot_ui import render_lead
    _, sent, _ = await run(db, FakeAI(True))
    text, kb = render_lead(sent[0][1])
    assert "Новый заказ" in text and "30к" in text
    assert kb.inline_keyboard[-1][0].callback_data.startswith("f:")
