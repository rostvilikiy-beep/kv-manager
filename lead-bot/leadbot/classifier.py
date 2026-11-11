"""ИИ-фильтр: отличает «человек ищет исполнителя» от рекламы, спама и вакансий."""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass

import anthropic

from .filters import CATEGORIES

log = logging.getLogger(__name__)

SYSTEM = """Ты фильтруешь сообщения из Telegram-чатов и Threads для фрилансера-разработчика.
Определи, является ли сообщение ЗАПРОСОМ КЛИЕНТА: автор сам ищет исполнителя \
(сделать сайт, лендинг, магазин, бота, приложение, дизайн, SEO, автоматизацию и т.п.).

НЕ лид:
- исполнитель/студия рекламирует свои услуги («делаю сайты», «возьму заказ»);
- вакансия в штат, поиск сотрудника на зарплату;
- курсы, обучение, вебинары, продажа готовых шаблонов;
- вопрос «как сделать самому», обсуждение, мем, спам.

Пиши summary и need по-русски, коротко (до 15 слов). Если бюджета или срока нет — null."""

SCHEMA = {
    "type": "object",
    "properties": {
        "is_lead": {"type": "boolean"},
        "confidence": {"type": "integer", "description": "0-100"},
        "category": {"type": "string", "enum": list(CATEGORIES.keys()) + ["other"]},
        "need": {"type": "string", "description": "что именно нужно сделать"},
        "budget": {"type": ["string", "null"]},
        "deadline": {"type": ["string", "null"]},
        "summary": {"type": "string"},
    },
    "required": ["is_lead", "confidence", "category", "need", "budget", "deadline", "summary"],
    "additionalProperties": False,
}


@dataclass
class Verdict:
    is_lead: bool
    confidence: int
    category: str
    need: str
    budget: str | None
    deadline: str | None
    summary: str

    def as_dict(self) -> dict:
        return self.__dict__.copy()


class Classifier:
    def __init__(self, api_key: str, model: str):
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.model = model

    async def classify(self, text: str) -> Verdict | None:
        """None — если ИИ недоступен (ошибка сети, лимиты). Тогда решает обычный фильтр."""
        try:
            resp = await self.client.beta.messages.create(
                model=self.model,
                max_tokens=1024,
                system=SYSTEM,
                messages=[{"role": "user", "content": f"<message>\n{text[:4000]}\n</message>"}],
                output_config={
                    "effort": "low",
                    "format": {"type": "json_schema", "schema": SCHEMA},
                },
                # если основная модель откажется отвечать — запрос автоматически
                # повторится на запасной модели
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            )
        except anthropic.RateLimitError:
            log.warning("Claude: rate limit, пропускаю ИИ-проверку")
            return None
        except anthropic.APIStatusError as e:
            log.warning("Claude API error %s: %s", e.status_code, e.message)
            return None
        except anthropic.APIConnectionError as e:
            log.warning("Claude: нет соединения: %s", e)
            return None

        if resp.stop_reason == "refusal":
            return Verdict(False, 0, "other", "", None, None, "отклонено моделью")

        raw = next((b.text for b in resp.content if b.type == "text"), "")
        try:
            data = json.loads(raw)
            return Verdict(**{k: data.get(k) for k in SCHEMA["required"]})
        except (json.JSONDecodeError, TypeError) as e:
            log.warning("Claude: не удалось разобрать ответ (%s): %r", e, raw[:200])
            return None
