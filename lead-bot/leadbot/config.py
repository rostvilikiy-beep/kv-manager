"""Настройки из переменных окружения (.env)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field

from dotenv import load_dotenv

load_dotenv()


def _ids(raw: str | None) -> set[int]:
    return {int(x) for x in (raw or "").replace(" ", "").split(",") if x}


@dataclass(frozen=True)
class Config:
    bot_token: str
    admin_ids: set[int]
    allowed_ids: set[int]
    access_mode: str  # "open" | "private"
    tg_api_id: int
    tg_api_hash: str
    tg_session: str
    anthropic_key: str
    claude_model: str
    threads_token: str
    threads_poll_minutes: int
    db_path: str
    dedup_hours: int
    free_delay_hours: float
    free_contacts_per_day: int
    pro_price_stars: int
    pro_days: int
    ref_bonus_days: int
    tz: str
    extra: dict = field(default_factory=dict)

    @property
    def ai_available(self) -> bool:
        return bool(self.anthropic_key)

    @property
    def threads_available(self) -> bool:
        return bool(self.threads_token)

    def can_use(self, user_id: int) -> bool:
        if self.access_mode == "open":
            return True
        return user_id in self.admin_ids or user_id in self.allowed_ids


def load() -> Config:
    return Config(
        bot_token=os.environ.get("BOT_TOKEN", ""),
        admin_ids=_ids(os.environ.get("ADMIN_IDS")),
        allowed_ids=_ids(os.environ.get("ALLOWED_USER_IDS")),
        access_mode=os.environ.get("ACCESS_MODE", "private").strip().lower(),
        tg_api_id=int(os.environ.get("TG_API_ID") or 0),
        tg_api_hash=os.environ.get("TG_API_HASH", ""),
        tg_session=os.environ.get("TG_SESSION", "userbot"),
        anthropic_key=os.environ.get("ANTHROPIC_API_KEY", ""),
        claude_model=os.environ.get("CLAUDE_MODEL", "claude-opus-5-5"),
        threads_token=os.environ.get("THREADS_ACCESS_TOKEN", ""),
        threads_poll_minutes=int(os.environ.get("THREADS_POLL_MINUTES") or 10),
        db_path=os.environ.get("DB_PATH", "data/leadbot.sqlite3"),
        dedup_hours=int(os.environ.get("DEDUP_HOURS") or 48),
        free_delay_hours=float(os.environ.get("FREE_DELAY_HOURS") or 4),
        free_contacts_per_day=int(os.environ.get("FREE_CONTACTS_PER_DAY") or 5),
        pro_price_stars=int(os.environ.get("PRO_PRICE_STARS") or 500),
        pro_days=int(os.environ.get("PRO_DAYS") or 30),
        ref_bonus_days=int(os.environ.get("REF_BONUS_DAYS") or 3),
        tz=os.environ.get("TZ_NAME", "Europe/Kyiv"),
    )
