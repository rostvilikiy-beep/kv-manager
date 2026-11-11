"""Threads: периодический поиск свежих постов по ключевым фразам через
официальный Threads API (эндпоинт keyword_search).

Нужен токен приложения Meta с правом threads_keyword_search. Без прохождения
App Review поиск работает только по постам аккаунтов-тестировщиков приложения,
а у API есть лимит запросов на поиск — поэтому опрос раз в несколько минут.
"""
from __future__ import annotations

import asyncio
import logging

import httpx

from .db import DB
from .pipeline import Incoming, Pipeline

log = logging.getLogger(__name__)

API = "https://graph.threads.net/v1.0/keyword_search"
FIELDS = "id,text,permalink,username,timestamp"


class ThreadsSource:
    def __init__(self, token: str, db: DB, pipeline: Pipeline, poll_minutes: int):
        self.token = token
        self.db = db
        self.pipeline = pipeline
        self.poll = max(1, poll_minutes) * 60
        self.last_error: str | None = None

    async def run_forever(self) -> None:
        async with httpx.AsyncClient(timeout=30) as http:
            while True:
                try:
                    await self.poll_once(http)
                    self.last_error = None
                except Exception as e:
                    self.last_error = str(e)
                    log.exception("Threads: ошибка опроса")
                await asyncio.sleep(self.poll)

    async def poll_once(self, http: httpx.AsyncClient) -> int:
        found = 0
        for q in await self.db.threads_queries():
            r = await http.get(API, params={
                "q": q, "search_type": "RECENT", "fields": FIELDS,
                "access_token": self.token,
            })
            if r.status_code != 200:
                raise RuntimeError(f"Threads API {r.status_code}: {r.text[:300]}")
            for post in r.json().get("data", []):
                text = post.get("text") or ""
                if not text or await self.db.threads_seen(post["id"]):
                    continue
                user = post.get("username")
                await self.pipeline.process(Incoming(
                    source="threads", text=text, chat="Threads",
                    author=f"@{user}" if user else None,
                    author_url=f"https://www.threads.net/@{user}" if user else None,
                    url=post.get("permalink"),
                ))
                found += 1
            await asyncio.sleep(2)  # не долбим API
        return found
