"""ИИ: проверка «это реально заказ/вакансия?», заголовок и выжимка для карточки,
генерация отклика."""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, fields

import anthropic

from .filters import CATEGORIES

log = logging.getLogger(__name__)

FALLBACK = {"betas": ["server-side-fallback-2026-07-01"], "fallbacks": "default"}

SYSTEM = """Ты фильтруешь сообщения из Telegram-чатов и Threads для фрилансеров и специалистов.
Определи, является ли сообщение ЗАПРОСОМ НА ИСПОЛНИТЕЛЯ: автор (человек или компания) \
ищет, кто сделает работу — разовый заказ (сайт, бот, дизайн, логотип, SMM, монтаж…) \
или сотрудника/фрилансера в команду (вакансия).

НЕ подходит (is_relevant=false):
- исполнитель/студия рекламирует свои услуги («делаю сайты», «возьму заказ»);
- человек ищет работу для себя, резюме;
- курсы, обучение, вебинары, продажа шаблонов/аккаунтов;
- вопрос «как сделать самому», обсуждение, мем, спам, крипта-схемы.

Поля:
- kind: "order" — разовый заказ/проект, "job" — работа в компании (штат, part/full-time).
- title: заголовок карточки на русском, начинается с «Ищут …», до 8 слов. \
Пример: «Ищут разработчика телеграм-бота», «Ищут UI/UX дизайнера для международного проекта».
- summary: 1–3 предложения на русском: что нужно, требования, условия. Без контактов.
- experience: требуемый опыт («от 2 лет») или null.
- work_format: remote / office / hybrid / unknown.
- budget, deadline: как в тексте, или null."""

SCHEMA = {
    "type": "object",
    "properties": {
        "is_relevant": {"type": "boolean"},
        "confidence": {"type": "integer", "description": "0-100"},
        "kind": {"type": "string", "enum": ["order", "job"]},
        "category": {"type": "string", "enum": list(CATEGORIES.keys()) + ["other"]},
        "title": {"type": "string"},
        "summary": {"type": "string"},
        "experience": {"type": ["string", "null"]},
        "work_format": {"type": "string", "enum": ["remote", "office", "hybrid", "unknown"]},
        "budget": {"type": ["string", "null"]},
        "deadline": {"type": ["string", "null"]},
    },
    "required": ["is_relevant", "confidence", "kind", "category", "title", "summary",
                 "experience", "work_format", "budget", "deadline"],
    "additionalProperties": False,
}


@dataclass
class Verdict:
    is_relevant: bool
    confidence: int
    kind: str
    category: str
    title: str
    summary: str
    experience: str | None
    work_format: str
    budget: str | None
    deadline: str | None

    def as_dict(self) -> dict:
        return self.__dict__.copy()

    @classmethod
    def from_dict(cls, d: dict | None) -> "Verdict | None":
        if not d:
            return None
        names = {f.name for f in fields(cls)}
        try:
            return cls(**{k: d.get(k) for k in names})
        except TypeError:
            return None


class Classifier:
    def __init__(self, api_key: str, model: str):
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.model = model

    async def _call(self, **kw):
        try:
            return await self.client.beta.messages.create(model=self.model, **FALLBACK, **kw)
        except anthropic.RateLimitError:
            log.warning("Claude: rate limit")
        except anthropic.APIStatusError as e:
            log.warning("Claude API error %s: %s", e.status_code, e.message)
        except anthropic.APIConnectionError as e:
            log.warning("Claude: нет соединения: %s", e)
        return None

    async def classify(self, text: str) -> Verdict | None:
        """None — если ИИ недоступен. Тогда решает обычный фильтр."""
        resp = await self._call(
            max_tokens=1024,
            system=SYSTEM,
            messages=[{"role": "user", "content": f"<message>\n{text[:4000]}\n</message>"}],
            output_config={"effort": "low",
                           "format": {"type": "json_schema", "schema": SCHEMA}},
        )
        if resp is None:
            return None
        if resp.stop_reason == "refusal":
            return Verdict(False, 0, "order", "other", "", "", None, "unknown", None, None)
        raw = next((b.text for b in resp.content if b.type == "text"), "")
        try:
            return Verdict.from_dict(json.loads(raw))
        except json.JSONDecodeError:
            log.warning("Claude: не удалось разобрать ответ: %r", raw[:200])
            return None

    async def write_reply(self, lead_text: str, about_me: str, lang: str) -> str | None:
        """Черновик отклика на заказ/вакансию от лица пользователя."""
        lang_name = {"uk": "украинском", "en": "английском"}.get(lang, "русском")
        system = (
            "Ты пишешь короткий отклик фрилансера на заказ или вакансию. "
            f"Пиши на {lang_name} языке, от первого лица, 3–6 предложений, без шаблонных фраз "
            "и без выдуманных фактов. Покажи, что понял задачу, коротко скажи, почему подходишь, "
            "задай 1 уточняющий вопрос. Только текст отклика, без пояснений."
        )
        about = about_me.strip() or "Специалист-фрилансер. Подробностей о себе не указал."
        resp = await self._call(
            max_tokens=2048,
            system=system,
            messages=[{"role": "user", "content":
                       f"<about_me>\n{about[:2000]}\n</about_me>\n\n"
                       f"<post>\n{lead_text[:4000]}\n</post>"}],
            output_config={"effort": "low"},
        )
        if resp is None or resp.stop_reason == "refusal":
            return None
        return next((b.text for b in resp.content if b.type == "text"), None)
