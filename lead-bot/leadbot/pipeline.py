"""Конвейер: сообщение из любого источника → фильтры → антидубли → ИИ → очередь доставки.

Pro-пользователи получают заказ сразу, бесплатные — через FREE_DELAY_HOURS.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass
from typing import Awaitable, Callable

from .classifier import Classifier, Verdict
from .db import DB, User
from .filters import detect_lang, match, text_hash

log = logging.getLogger(__name__)

AI_MIN_CONFIDENCE = 60


@dataclass
class Incoming:
    source: str                 # "telegram" | "threads"
    text: str
    chat_id: int | None = None  # id чата (для личных групп пользователей)
    chat: str | None = None
    author: str | None = None
    author_url: str | None = None
    url: str | None = None


# (user, lead_row, match_info) -> отправить карточку
Send = Callable[[User, dict, dict], Awaitable[None]]


def passes_ai_prefs(u: User, v: Verdict | None) -> bool:
    if v is None:  # ИИ недоступен — решает обычный фильтр
        return True
    if u.ai_filter and (not v.is_relevant or v.confidence < AI_MIN_CONFIDENCE):
        return False
    if v.kind not in u.kinds:
        return False
    if v.kind == "job" and v.work_format != "unknown" and v.work_format not in u.formats:
        return False
    return True


class Pipeline:
    def __init__(self, db: DB, classifier: Classifier | None, send: Send, *,
                 dedup_hours: int, free_delay_hours: float, admin_ids: set[int]):
        self.db = db
        self.classifier = classifier
        self.send = send
        self.dedup_hours = dedup_hours
        self.free_delay = int(free_delay_hours * 3600)
        self.admin_ids = admin_ids
        self.stats = {"seen": 0, "matched": 0, "ai_rejected": 0, "queued": 0}
        self._flush_lock = asyncio.Lock()

    def is_pro(self, u: User) -> bool:
        return u.is_pro or u.id in self.admin_ids

    async def process(self, msg: Incoming) -> int:
        """Возвращает, скольким пользователям поставлен в очередь заказ."""
        self.stats["seen"] += 1
        audience = await self.db.chat_audience(msg.chat_id)
        lang = detect_lang(msg.text)
        users = [u for u in await self.db.active_users()
                 if msg.source in u.sources and lang in u.langs
                 and (audience is None or u.id in audience)]
        if not users:
            return 0

        hits = []
        for u in users:
            res = match(msg.text, u.filter())
            if res.ok:
                hits.append((u, res))
        if not hits:
            return 0

        if await self.db.seen_recently(text_hash(msg.text), self.dedup_hours):
            return 0
        self.stats["matched"] += 1

        verdict = await self.classifier.classify(msg.text) if self.classifier else None
        recipients = [(u, r) for u, r in hits if passes_ai_prefs(u, verdict)]
        if not recipients:
            self.stats["ai_rejected"] += 1
            log.info("Отсеяно ИИ: %s", msg.text[:80].replace("\n", " "))
            return 0

        lead_id = await self.db.add_lead(
            source=msg.source, chat_id=msg.chat_id, chat=msg.chat, author=msg.author,
            author_url=msg.author_url, url=msg.url, text=msg.text, lang=lang,
            ai=verdict.as_dict() if verdict else None)

        now = int(time.time())
        for u, res in recipients:
            due = now if self.is_pro(u) else now + self.free_delay
            await self.db.queue(u.id, lead_id,
                                {"categories": res.categories, "keyword": res.keyword}, due)
        self.stats["queued"] += len(recipients)
        await self.flush()  # Pro — сразу
        return len(recipients)

    async def flush(self) -> int:
        """Отправить всё, у чего подошло время."""
        async with self._flush_lock:
            return await self._flush()

    async def _flush(self) -> int:
        sent = 0
        for d in await self.db.due():
            u = await self.db.get_user(d["user_id"])
            lead = await self.db.get_lead(d["lead_id"])
            if not u or not lead or not u.active:
                await self.db.mark_sent(d["user_id"], d["lead_id"], -1)
                continue
            try:
                await self.send(u, lead, json.loads(d["match"] or "{}"))
                await self.db.mark_sent(u.id, lead["id"])
                sent += 1
            except Exception:  # пользователь заблокировал бота и т.п.
                log.exception("Не удалось отправить заказ %s пользователю %s", lead["id"], u.id)
                await self.db.mark_sent(u.id, lead["id"], -1)
        return sent

    async def run_sender(self, every: int = 30) -> None:
        while True:
            try:
                await self.flush()
            except Exception:
                log.exception("Ошибка в рассылке очереди")
            await asyncio.sleep(every)
