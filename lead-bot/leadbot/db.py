"""SQLite: пользователи и их настройки, лиды, очередь доставки, группы, оплаты."""
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field

import aiosqlite

from .filters import DEFAULT_STOPWORDS, UserFilter

ALL_SOURCES = ["telegram", "threads"]
ALL_LANGS = ["uk", "ru", "en"]
ALL_KINDS = ["order", "job"]          # разовый заказ / работа в компании
ALL_FORMATS = ["remote", "office", "hybrid"]

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    username      TEXT,
    first_name    TEXT,
    active        INTEGER NOT NULL DEFAULT 1,
    ai_filter     INTEGER NOT NULL DEFAULT 1,
    plan_until    INTEGER NOT NULL DEFAULT 0,
    categories    TEXT NOT NULL DEFAULT '["site","landing","shop","tgbot"]',
    keywords      TEXT NOT NULL DEFAULT '[]',
    stopwords     TEXT NOT NULL DEFAULT '[]',
    sources       TEXT NOT NULL DEFAULT '["telegram","threads"]',
    langs         TEXT NOT NULL DEFAULT '["uk","ru","en"]',
    kinds         TEXT NOT NULL DEFAULT '["order","job"]',
    formats       TEXT NOT NULL DEFAULT '["remote","office","hybrid"]',
    card_style    TEXT NOT NULL DEFAULT 'short',
    reply_prompt  TEXT NOT NULL DEFAULT '',
    contacts_day  TEXT NOT NULL DEFAULT '',
    contacts_used INTEGER NOT NULL DEFAULT 0,
    ref_by        INTEGER,
    created_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS seen (
    hash TEXT PRIMARY KEY,
    ts   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS leads (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    source     TEXT NOT NULL,
    chat_id    INTEGER,
    chat       TEXT,
    author     TEXT,
    author_url TEXT,
    url        TEXT,
    text       TEXT NOT NULL,
    lang       TEXT,
    ai         TEXT,
    ts         INTEGER NOT NULL
);
-- очередь доставки: бесплатным — с задержкой, Pro — сразу
CREATE TABLE IF NOT EXISTS deliveries (
    user_id   INTEGER NOT NULL,
    lead_id   INTEGER NOT NULL,
    match     TEXT,
    due_ts    INTEGER NOT NULL,
    sent      INTEGER NOT NULL DEFAULT 0,
    feedback  INTEGER,
    saved     INTEGER NOT NULL DEFAULT 0,
    contacts  INTEGER NOT NULL DEFAULT 0,
    ts        INTEGER NOT NULL,
    PRIMARY KEY (user_id, lead_id)
);
CREATE INDEX IF NOT EXISTS deliveries_due ON deliveries(sent, due_ts);
-- чаты юзербота: owner_id = 0 — общий чат для всех, иначе личная группа пользователя
CREATE TABLE IF NOT EXISTS chats (
    chat_id  INTEGER NOT NULL,
    owner_id INTEGER NOT NULL,
    title    TEXT,
    PRIMARY KEY (chat_id, owner_id)
);
CREATE TABLE IF NOT EXISTS payments (
    charge_id TEXT PRIMARY KEY,
    user_id   INTEGER NOT NULL,
    stars     INTEGER NOT NULL,
    days      INTEGER NOT NULL,
    ts        INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS threads_queries (
    q TEXT PRIMARY KEY
);
CREATE TABLE IF NOT EXISTS threads_seen (
    id TEXT PRIMARY KEY,
    ts INTEGER NOT NULL
);
"""

DEFAULT_THREADS_QUERIES = [
    "нужен сайт", "потрібен сайт", "ищу разработчика", "шукаю розробника",
    "нужен лендинг", "потрібен лендінг", "нужен телеграм бот", "потрібен телеграм бот",
    "шукаємо дизайнера", "ищу дизайнера",
]

JSON_COLS = {"categories", "keywords", "stopwords", "sources", "langs", "kinds", "formats"}
FLAG_COLS = {"active", "ai_filter"}


@dataclass
class User:
    id: int
    username: str | None = None
    first_name: str | None = None
    active: bool = True
    ai_filter: bool = True
    plan_until: int = 0
    categories: list[str] = field(default_factory=list)
    keywords: list[str] = field(default_factory=list)
    stopwords: list[str] = field(default_factory=list)
    sources: list[str] = field(default_factory=lambda: list(ALL_SOURCES))
    langs: list[str] = field(default_factory=lambda: list(ALL_LANGS))
    kinds: list[str] = field(default_factory=lambda: list(ALL_KINDS))
    formats: list[str] = field(default_factory=lambda: list(ALL_FORMATS))
    card_style: str = "short"
    reply_prompt: str = ""
    contacts_day: str = ""
    contacts_used: int = 0
    ref_by: int | None = None

    @property
    def is_pro(self) -> bool:
        return self.plan_until > time.time()

    def filter(self) -> UserFilter:
        return UserFilter(categories=self.categories, keywords=self.keywords,
                          stopwords=DEFAULT_STOPWORDS + self.stopwords)


def _row_to_user(r: aiosqlite.Row) -> User:
    d = dict(r)
    d.pop("created_at", None)
    for c in JSON_COLS:
        d[c] = json.loads(d[c])
    for c in FLAG_COLS:
        d[c] = bool(d[c])
    return User(**d)


def _today() -> str:
    return time.strftime("%Y-%m-%d")


class DB:
    def __init__(self, path: str):
        self.path = path
        self.conn: aiosqlite.Connection | None = None

    async def open(self) -> None:
        os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
        self.conn = await aiosqlite.connect(self.path)
        self.conn.row_factory = aiosqlite.Row
        await self.conn.executescript(SCHEMA)
        cur = await self.conn.execute("SELECT COUNT(*) FROM threads_queries")
        if (await cur.fetchone())[0] == 0:
            await self.conn.executemany("INSERT INTO threads_queries(q) VALUES (?)",
                                        [(q,) for q in DEFAULT_THREADS_QUERIES])
        await self.conn.commit()

    async def close(self) -> None:
        if self.conn:
            await self.conn.close()

    # ---------- users ----------
    async def get_user(self, uid: int) -> User | None:
        cur = await self.conn.execute("SELECT * FROM users WHERE id=?", (uid,))
        r = await cur.fetchone()
        return _row_to_user(r) if r else None

    async def ensure_user(self, uid: int, username: str | None = None,
                          first_name: str | None = None) -> tuple[User, bool]:
        """Возвращает (пользователь, создан_только_что)."""
        cur = await self.conn.execute(
            "INSERT INTO users(id, username, first_name, created_at) VALUES (?,?,?,?) "
            "ON CONFLICT(id) DO NOTHING", (uid, username, first_name, int(time.time())))
        created = cur.rowcount == 1
        if not created and (username or first_name):
            await self.conn.execute("UPDATE users SET username=?, first_name=? WHERE id=?",
                                    (username, first_name, uid))
        await self.conn.commit()
        return await self.get_user(uid), created

    async def active_users(self) -> list[User]:
        cur = await self.conn.execute("SELECT * FROM users WHERE active=1")
        return [_row_to_user(r) for r in await cur.fetchall()]

    async def update(self, uid: int, **fields) -> None:
        sets, vals = [], []
        for k, v in fields.items():
            if k in JSON_COLS:
                v = json.dumps(v, ensure_ascii=False)
            elif k in FLAG_COLS:
                v = int(v)
            elif k not in {"card_style", "reply_prompt", "plan_until", "ref_by"}:
                raise ValueError(k)
            sets.append(f"{k}=?")
            vals.append(v)
        await self.conn.execute(f"UPDATE users SET {', '.join(sets)} WHERE id=?", (*vals, uid))
        await self.conn.commit()

    async def add_pro_days(self, uid: int, days: int) -> int:
        u = await self.get_user(uid)
        base = max(u.plan_until, int(time.time()))
        until = base + days * 86400
        await self.update(uid, plan_until=until)
        return until

    async def use_contact(self, uid: int, limit: int) -> int | None:
        """Списывает одно открытие контактов. None — лимит на сегодня исчерпан."""
        u = await self.get_user(uid)
        used = u.contacts_used if u.contacts_day == _today() else 0
        if used >= limit:
            return None
        await self.conn.execute("UPDATE users SET contacts_day=?, contacts_used=? WHERE id=?",
                                (_today(), used + 1, uid))
        await self.conn.commit()
        return used + 1

    def contacts_used_today(self, u: User) -> int:
        return u.contacts_used if u.contacts_day == _today() else 0

    async def referrals_count(self, uid: int) -> int:
        cur = await self.conn.execute("SELECT COUNT(*) FROM users WHERE ref_by=?", (uid,))
        return (await cur.fetchone())[0]

    async def users_count(self) -> tuple[int, int]:
        cur = await self.conn.execute(
            "SELECT COUNT(*), SUM(plan_until > ?) FROM users", (int(time.time()),))
        total, pro = await cur.fetchone()
        return total, pro or 0

    # ---------- dedup ----------
    async def seen_recently(self, h: str, hours: int) -> bool:
        """True, если такой текст уже был. Иначе запоминает его."""
        now = int(time.time())
        cur = await self.conn.execute("SELECT ts FROM seen WHERE hash=?", (h,))
        r = await cur.fetchone()
        if r and now - r["ts"] < hours * 3600:
            return True
        await self.conn.execute(
            "INSERT INTO seen(hash, ts) VALUES (?,?) ON CONFLICT(hash) DO UPDATE SET ts=excluded.ts",
            (h, now))
        await self.conn.execute("DELETE FROM seen WHERE ts < ?", (now - 14 * 86400,))
        await self.conn.commit()
        return False

    # ---------- leads ----------
    async def add_lead(self, *, source: str, chat_id: int | None, chat: str | None,
                       author: str | None, author_url: str | None, url: str | None,
                       text: str, lang: str, ai: dict | None) -> int:
        cur = await self.conn.execute(
            "INSERT INTO leads(source, chat_id, chat, author, author_url, url, text, lang, ai, ts) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            (source, chat_id, chat, author, author_url, url, text, lang,
             json.dumps(ai, ensure_ascii=False) if ai else None, int(time.time())))
        await self.conn.commit()
        return cur.lastrowid

    async def get_lead(self, lead_id: int) -> dict | None:
        cur = await self.conn.execute("SELECT * FROM leads WHERE id=?", (lead_id,))
        r = await cur.fetchone()
        if not r:
            return None
        d = dict(r)
        d["ai"] = json.loads(d["ai"]) if d["ai"] else None
        return d

    # ---------- deliveries ----------
    async def queue(self, uid: int, lead_id: int, match: dict, due_ts: int) -> None:
        await self.conn.execute(
            "INSERT OR IGNORE INTO deliveries(user_id, lead_id, match, due_ts, ts) VALUES (?,?,?,?,?)",
            (uid, lead_id, json.dumps(match, ensure_ascii=False), due_ts, int(time.time())))
        await self.conn.commit()

    async def due(self, limit: int = 50) -> list[dict]:
        cur = await self.conn.execute(
            "SELECT user_id, lead_id, match FROM deliveries WHERE sent=0 AND due_ts<=? "
            "ORDER BY due_ts LIMIT ?", (int(time.time()), limit))
        return [dict(r) for r in await cur.fetchall()]

    async def mark_sent(self, uid: int, lead_id: int, value: int = 1) -> None:
        await self.conn.execute("UPDATE deliveries SET sent=? WHERE user_id=? AND lead_id=?",
                                (value, uid, lead_id))
        await self.conn.commit()

    async def make_due_now(self, uid: int) -> None:
        """После оплаты Pro — отправить всё, что ждало задержки."""
        await self.conn.execute("UPDATE deliveries SET due_ts=? WHERE user_id=? AND sent=0",
                                (int(time.time()), uid))
        await self.conn.commit()

    async def chat_known(self, chat_id: int) -> bool:
        cur = await self.conn.execute("SELECT 1 FROM chats WHERE chat_id=? LIMIT 1", (chat_id,))
        return await cur.fetchone() is not None

    async def delivery(self, uid: int, lead_id: int) -> dict | None:
        cur = await self.conn.execute(
            "SELECT * FROM deliveries WHERE user_id=? AND lead_id=?", (uid, lead_id))
        r = await cur.fetchone()
        return dict(r) if r else None

    async def set_delivery(self, uid: int, lead_id: int, **fields) -> None:
        assert set(fields) <= {"feedback", "saved", "contacts"}
        sets = ", ".join(f"{k}=?" for k in fields)
        await self.conn.execute(f"UPDATE deliveries SET {sets} WHERE user_id=? AND lead_id=?",
                                (*fields.values(), uid, lead_id))
        await self.conn.commit()

    async def feed(self, uid: int, days: int = 7, saved_only: bool = False,
                   limit: int = 20) -> list[dict]:
        q = ("SELECT l.*, d.saved FROM deliveries d JOIN leads l ON l.id=d.lead_id "
             "WHERE d.user_id=? AND d.sent=1 AND l.ts>=?")
        if saved_only:
            q += " AND d.saved=1"
        q += " ORDER BY l.ts DESC LIMIT ?"
        since = 0 if saved_only else int(time.time()) - days * 86400
        cur = await self.conn.execute(q, (uid, since, limit))
        out = []
        for r in await cur.fetchall():
            d = dict(r)
            d["ai"] = json.loads(d["ai"]) if d["ai"] else None
            out.append(d)
        return out

    async def stats(self, uid: int) -> dict:
        now = int(time.time())
        q = "SELECT COUNT(*) FROM deliveries WHERE user_id=? AND ts>=?"
        out = {}
        for label, since in (("today", now - 86400), ("week", now - 7 * 86400), ("all", 0)):
            cur = await self.conn.execute(q, (uid, since))
            out[label] = (await cur.fetchone())[0]
        cur = await self.conn.execute(
            "SELECT SUM(feedback=1), SUM(feedback=-1), SUM(sent=0) FROM deliveries WHERE user_id=?",
            (uid,))
        good, bad, waiting = await cur.fetchone()
        out["good"], out["bad"], out["waiting"] = good or 0, bad or 0, waiting or 0
        return out

    # ---------- chats ----------
    async def add_chat(self, chat_id: int, owner_id: int, title: str) -> None:
        await self.conn.execute(
            "INSERT OR REPLACE INTO chats(chat_id, owner_id, title) VALUES (?,?,?)",
            (chat_id, owner_id, title))
        await self.conn.commit()

    async def remove_chat(self, chat_id: int, owner_id: int) -> None:
        await self.conn.execute("DELETE FROM chats WHERE chat_id=? AND owner_id=?",
                                (chat_id, owner_id))
        await self.conn.commit()

    async def user_chats(self, owner_id: int) -> list[dict]:
        cur = await self.conn.execute(
            "SELECT chat_id, title FROM chats WHERE owner_id=? ORDER BY title", (owner_id,))
        return [dict(r) for r in await cur.fetchall()]

    async def chat_audience(self, chat_id: int | None) -> set[int] | None:
        """None — чат общий (заказы получают все). Иначе — только эти владельцы."""
        if chat_id is None:
            return None
        cur = await self.conn.execute("SELECT owner_id FROM chats WHERE chat_id=?", (chat_id,))
        owners = {r["owner_id"] for r in await cur.fetchall()}
        if not owners or 0 in owners:
            return None
        return owners

    async def chat_owner_count(self, chat_id: int) -> int:
        cur = await self.conn.execute("SELECT COUNT(*) FROM chats WHERE chat_id=?", (chat_id,))
        return (await cur.fetchone())[0]

    # ---------- payments ----------
    async def add_payment(self, charge_id: str, uid: int, stars: int, days: int) -> bool:
        cur = await self.conn.execute(
            "INSERT OR IGNORE INTO payments(charge_id, user_id, stars, days, ts) VALUES (?,?,?,?,?)",
            (charge_id, uid, stars, days, int(time.time())))
        await self.conn.commit()
        return cur.rowcount == 1

    # ---------- threads ----------
    async def threads_queries(self) -> list[str]:
        cur = await self.conn.execute("SELECT q FROM threads_queries ORDER BY q")
        return [r["q"] for r in await cur.fetchall()]

    async def add_threads_query(self, q: str) -> None:
        await self.conn.execute("INSERT OR IGNORE INTO threads_queries(q) VALUES (?)", (q,))
        await self.conn.commit()

    async def del_threads_query(self, q: str) -> None:
        await self.conn.execute("DELETE FROM threads_queries WHERE q=?", (q,))
        await self.conn.commit()

    async def threads_seen(self, post_id: str) -> bool:
        cur = await self.conn.execute("SELECT 1 FROM threads_seen WHERE id=?", (post_id,))
        if await cur.fetchone():
            return True
        await self.conn.execute("INSERT INTO threads_seen(id, ts) VALUES (?,?)",
                                (post_id, int(time.time())))
        await self.conn.commit()
        return False
