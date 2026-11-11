"""SQLite: пользователи и их фильтры, лиды, дедупликация, отзывы."""
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field

import aiosqlite

from .filters import DEFAULT_STOPWORDS, UserFilter

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    username      TEXT,
    active        INTEGER NOT NULL DEFAULT 1,
    ai_filter     INTEGER NOT NULL DEFAULT 1,
    src_telegram  INTEGER NOT NULL DEFAULT 1,
    src_threads   INTEGER NOT NULL DEFAULT 1,
    categories    TEXT NOT NULL DEFAULT '["site","landing","shop"]',
    keywords      TEXT NOT NULL DEFAULT '[]',
    stopwords     TEXT NOT NULL DEFAULT '[]',
    created_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS seen (
    hash TEXT PRIMARY KEY,
    ts   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS leads (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    source     TEXT NOT NULL,
    chat       TEXT,
    author     TEXT,
    url        TEXT,
    text       TEXT NOT NULL,
    ai         TEXT,
    ts         INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS deliveries (
    user_id  INTEGER NOT NULL,
    lead_id  INTEGER NOT NULL,
    feedback INTEGER,          -- 1 = подходит, -1 = мимо
    ts       INTEGER NOT NULL,
    PRIMARY KEY (user_id, lead_id)
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
    "нужен сайт", "ищу разработчика сайта", "нужен лендинг",
    "сделать сайт", "нужен телеграм бот", "ищу веб-разработчика",
]


@dataclass
class User:
    id: int
    username: str | None
    active: bool
    ai_filter: bool
    src_telegram: bool
    src_threads: bool
    categories: list[str] = field(default_factory=list)
    keywords: list[str] = field(default_factory=list)
    stopwords: list[str] = field(default_factory=list)

    def filter(self) -> UserFilter:
        return UserFilter(
            categories=self.categories,
            keywords=self.keywords,
            stopwords=DEFAULT_STOPWORDS + self.stopwords,
        )


def _row_to_user(r: aiosqlite.Row) -> User:
    return User(
        id=r["id"], username=r["username"], active=bool(r["active"]),
        ai_filter=bool(r["ai_filter"]), src_telegram=bool(r["src_telegram"]),
        src_threads=bool(r["src_threads"]),
        categories=json.loads(r["categories"]), keywords=json.loads(r["keywords"]),
        stopwords=json.loads(r["stopwords"]),
    )


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
            await self.conn.executemany(
                "INSERT INTO threads_queries(q) VALUES (?)",
                [(q,) for q in DEFAULT_THREADS_QUERIES],
            )
        await self.conn.commit()

    async def close(self) -> None:
        if self.conn:
            await self.conn.close()

    # ---------- users ----------
    async def get_user(self, uid: int) -> User | None:
        cur = await self.conn.execute("SELECT * FROM users WHERE id=?", (uid,))
        r = await cur.fetchone()
        return _row_to_user(r) if r else None

    async def ensure_user(self, uid: int, username: str | None) -> User:
        await self.conn.execute(
            "INSERT INTO users(id, username, created_at) VALUES (?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET username=excluded.username",
            (uid, username, int(time.time())),
        )
        await self.conn.commit()
        return await self.get_user(uid)

    async def active_users(self) -> list[User]:
        cur = await self.conn.execute("SELECT * FROM users WHERE active=1")
        return [_row_to_user(r) for r in await cur.fetchall()]

    async def set_flag(self, uid: int, column: str, value: bool) -> None:
        assert column in {"active", "ai_filter", "src_telegram", "src_threads"}
        await self.conn.execute(f"UPDATE users SET {column}=? WHERE id=?", (int(value), uid))
        await self.conn.commit()

    async def set_list(self, uid: int, column: str, values: list[str]) -> None:
        assert column in {"categories", "keywords", "stopwords"}
        await self.conn.execute(
            f"UPDATE users SET {column}=? WHERE id=?",
            (json.dumps(values, ensure_ascii=False), uid),
        )
        await self.conn.commit()

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
            (h, now),
        )
        await self.conn.execute("DELETE FROM seen WHERE ts < ?", (now - 14 * 86400,))
        await self.conn.commit()
        return False

    # ---------- leads ----------
    async def add_lead(self, source: str, chat: str | None, author: str | None,
                       url: str | None, text: str, ai: dict | None) -> int:
        cur = await self.conn.execute(
            "INSERT INTO leads(source, chat, author, url, text, ai, ts) VALUES (?,?,?,?,?,?,?)",
            (source, chat, author, url, text,
             json.dumps(ai, ensure_ascii=False) if ai else None, int(time.time())),
        )
        await self.conn.commit()
        return cur.lastrowid

    async def add_delivery(self, uid: int, lead_id: int) -> None:
        await self.conn.execute(
            "INSERT OR IGNORE INTO deliveries(user_id, lead_id, ts) VALUES (?,?,?)",
            (uid, lead_id, int(time.time())),
        )
        await self.conn.commit()

    async def set_feedback(self, uid: int, lead_id: int, value: int) -> None:
        await self.conn.execute(
            "UPDATE deliveries SET feedback=? WHERE user_id=? AND lead_id=?",
            (value, uid, lead_id),
        )
        await self.conn.commit()

    async def stats(self, uid: int) -> dict:
        now = int(time.time())
        q = "SELECT COUNT(*) FROM deliveries WHERE user_id=? AND ts>=?"
        out = {}
        for label, since in (("today", now - 86400), ("week", now - 7 * 86400), ("all", 0)):
            cur = await self.conn.execute(q, (uid, since))
            out[label] = (await cur.fetchone())[0]
        cur = await self.conn.execute(
            "SELECT SUM(feedback=1), SUM(feedback=-1) FROM deliveries WHERE user_id=?", (uid,))
        good, bad = await cur.fetchone()
        out["good"], out["bad"] = good or 0, bad or 0
        return out

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
