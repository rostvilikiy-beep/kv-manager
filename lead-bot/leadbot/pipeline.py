"""Общий конвейер: сообщение из любого источника → фильтры → ИИ → рассылка."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Awaitable, Callable

from .classifier import Classifier, Verdict
from .db import DB, User
from .filters import match, text_hash

log = logging.getLogger(__name__)

# Минимальная уверенность ИИ, чтобы прислать лид
AI_MIN_CONFIDENCE = 60


@dataclass
class Incoming:
    source: str               # "telegram" | "threads"
    text: str
    chat: str | None = None    # название чата / "Threads"
    author: str | None = None  # @username или имя
    author_url: str | None = None
    url: str | None = None     # ссылка на сообщение / пост


@dataclass
class Lead:
    id: int
    msg: Incoming
    verdict: Verdict | None
    categories: list[str]
    keyword: str | None


Notify = Callable[[User, Lead], Awaitable[None]]


class Pipeline:
    def __init__(self, db: DB, classifier: Classifier | None, notify: Notify, dedup_hours: int):
        self.db = db
        self.classifier = classifier
        self.notify = notify
        self.dedup_hours = dedup_hours
        self.stats = {"seen": 0, "matched": 0, "ai_rejected": 0, "sent": 0}

    async def process(self, msg: Incoming) -> int:
        """Возвращает, скольким пользователям ушёл лид."""
        self.stats["seen"] += 1
        users = [u for u in await self.db.active_users()
                 if (u.src_telegram if msg.source == "telegram" else u.src_threads)]
        if not users:
            return 0

        # 1. Обычные фильтры для каждого пользователя
        hits: list[tuple[User, object]] = []
        for u in users:
            res = match(msg.text, u.filter())
            if res.ok:
                hits.append((u, res))
        if not hits:
            return 0

        # 2. Дубликаты (один и тот же текст в разных чатах)
        if await self.db.seen_recently(text_hash(msg.text), self.dedup_hours):
            return 0
        self.stats["matched"] += 1

        # 3. ИИ — один вызов на сообщение, только если кому-то он нужен
        verdict: Verdict | None = None
        if self.classifier and any(u.ai_filter for u, _ in hits):
            verdict = await self.classifier.classify(msg.text)

        recipients = []
        for u, res in hits:
            if u.ai_filter and verdict is not None:
                if not verdict.is_lead or verdict.confidence < AI_MIN_CONFIDENCE:
                    continue
            recipients.append((u, res))

        if not recipients:
            self.stats["ai_rejected"] += 1
            log.info("ИИ отсеял: %s", msg.text[:80].replace("\n", " "))
            return 0

        lead_id = await self.db.add_lead(
            msg.source, msg.chat, msg.author, msg.url, msg.text,
            verdict.as_dict() if verdict else None,
        )
        sent = 0
        for u, res in recipients:
            lead = Lead(lead_id, msg, verdict, res.categories, res.keyword)
            try:
                await self.notify(u, lead)
                await self.db.add_delivery(u.id, lead_id)
                sent += 1
            except Exception:  # пользователь заблокировал бота и т.п.
                log.exception("Не удалось отправить лид пользователю %s", u.id)
        self.stats["sent"] += sent
        return sent
