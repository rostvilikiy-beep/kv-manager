"""Фильтрация сообщений: категории, ключевые слова, стоп-слова.

Логика без ИИ:
  сообщение — лид, если в нём есть «маркер запроса» (нужен, ищу, кто сделает…)
  И слово из выбранной категории / своё ключевое слово,
  И нет стоп-слов (реклама исполнителей и т.п.).
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass

# Ключи — id категорий, хранятся в БД. Слова — основы (ищутся как начало слова).
CATEGORIES: dict[str, tuple[str, list[str]]] = {
    "site": ("🌐 Сайты", [
        "сайт", "веб-сайт", "вебсайт", "website", "web site", "многостраничн",
        "корпоративн сайт", "сайт-визитк", "визитк", "tilda", "тильд", "wordpress",
        "вордпресс", "webflow", "вебфлоу", "битрикс", "bitrix", "редизайн",
    ]),
    "landing": ("📄 Лендинги", [
        "лендинг", "landing", "одностраничник", "посадочн страниц",
    ]),
    "shop": ("🛒 Интернет-магазины", [
        "интернет-магазин", "интернет магазин", "магазин на сайт", "shopify",
        "woocommerce", "opencart", "e-commerce", "ecommerce",
    ]),
    "tgbot": ("🤖 Телеграм-боты", [
        "телеграм бот", "телеграм-бот", "телеграмм бот", "тг бот", "тг-бот",
        "бота для телеграм", "чат-бот", "чат бот", "чатбот", "telegram bot",
        "mini app", "мини-апп", "мини апп", "web app", "бот$", "бота$", "ботов$",
        "ботика$",
    ]),
    "app": ("📱 Мобильные приложения", [
        "мобильн приложен", "приложение для ios", "приложение для android",
        "приложение под", "flutter", "react native", "ios-приложен", "android-приложен",
    ]),
    "design": ("🎨 Дизайн / UI/UX", [
        "дизайн сайт", "дизайнер", "ui/ux", "ui ux", "figma", "фигм", "макет",
        "прототип",
    ]),
    "seo": ("📈 SEO / продвижение сайта", [
        "seo", "сео$", "продвижение сайт", "раскрутк сайт", "контекстн реклам",
        "яндекс директ", "директолог", "таргетолог",
    ]),
    "automation": ("⚙️ Автоматизация / парсинг", [
        "парсер", "парсинг", "автоматизац", "интеграц", "crm", "срм", "скрипт",
        "amocrm", "амо$", "make.com", "n8n", "zapier",
    ]),
}

# «Человек что-то ищет / заказывает»
INTENT_MARKERS = [
    "нужен", "нужна", "нужно", "нужны", "надо", "ищу", "ищем", "ищется",
    "требуется", "требуются", "кто сделает", "кто может сделать", "кто может",
    "кто умеет", "кто занимается", "посоветуйте", "порекомендуйте", "подскажите",
    "есть кто", "нужен исполнитель", "заказать", "закажу", "хочу заказать",
    "хочу сайт", "хочу бота", "сделать сайт", "сделать бота", "сделать лендинг",
    "разработать", "разработка", "в поиске", "looking for", "need a", "need someone",
    "хочу сделать", "кто возьмется", "кто возьмётся", "бюджет", "тз$",
]

# Типичная реклама исполнителей — по умолчанию отсекаем
DEFAULT_STOPWORDS = [
    "делаю сайты", "создаю сайты", "разрабатываю сайты", "делаю ботов",
    "предлагаю услуги", "мои услуги", "наши услуги", "наша студия", "наше агентство",
    "портфолио в профиле", "пишите в лс за", "обращайтесь", "беру заказы",
    "принимаю заказы", "ищу заказы", "ищу клиентов", "ищу работу", "резюме",
    "вакансия", "в штат", "оклад", "курс по", "обучение", "вебинар",
]

_WS = re.compile(r"\s+")


def normalize(text: str) -> str:
    text = (text or "").lower().replace("ё", "е")
    return _WS.sub(" ", text).strip()


def _phrase_regex(phrase: str) -> re.Pattern:
    """Каждое слово фразы ищем как начало слова: «мобильн приложен» ловит
    «мобильное приложение», «сайт» ловит «сайта», но не «посайтовый».
    Знак $ в конце — слово целиком («бот$» не поймает «ботинки»)."""
    exact = phrase.endswith("$")
    parts = [re.escape(p) for p in normalize(phrase.rstrip("$")).split(" ") if p]
    body = r"\w*[\s,.\-]+".join(parts)
    return re.compile(r"(?<!\w)" + body + (r"(?!\w)" if exact else ""), re.IGNORECASE)


_cache: dict[str, re.Pattern] = {}


def contains(text_norm: str, phrase: str) -> bool:
    rx = _cache.get(phrase)
    if rx is None:
        rx = _cache[phrase] = _phrase_regex(phrase)
    return rx.search(text_norm) is not None


def find_any(text_norm: str, phrases: list[str]) -> str | None:
    for p in phrases:
        if p and contains(text_norm, p):
            return p
    return None


def has_intent(text_norm: str) -> bool:
    return find_any(text_norm, INTENT_MARKERS) is not None


def matched_categories(text_norm: str) -> list[str]:
    return [cid for cid, (_, words) in CATEGORIES.items() if find_any(text_norm, words)]


def text_hash(text: str) -> str:
    """Хеш для дедупликации: один и тот же запрос часто кидают в 10 чатов."""
    t = re.sub(r"[^\w]+", "", normalize(text))
    return hashlib.sha1(t.encode()).hexdigest()


@dataclass
class UserFilter:
    categories: list[str]
    keywords: list[str]
    stopwords: list[str]
    require_intent: bool = True
    min_len: int = 15
    max_len: int = 3000


@dataclass
class MatchResult:
    ok: bool
    reason: str
    categories: list[str]
    keyword: str | None = None


def match(text: str, f: UserFilter) -> MatchResult:
    """Проверка сообщения против фильтров одного пользователя (без ИИ)."""
    t = normalize(text)
    if not (f.min_len <= len(t) <= f.max_len):
        return MatchResult(False, "length", [])

    stop = find_any(t, f.stopwords)
    if stop:
        return MatchResult(False, f"stopword:{stop}", [])

    cats = [c for c in matched_categories(t) if c in f.categories]
    kw = find_any(t, f.keywords)
    if not cats and not kw:
        return MatchResult(False, "no_keywords", [])

    # Своё ключевое слово пользователя — сильный сигнал, маркер не обязателен
    if f.require_intent and not kw and not has_intent(t):
        return MatchResult(False, "no_intent", cats)

    return MatchResult(True, "ok", cats, kw)


def quick_prefilter(text: str) -> bool:
    """Дешёвая проверка до похода в БД: есть ли вообще хоть какой-то шанс."""
    t = normalize(text)
    return len(t) >= 15 and (bool(matched_categories(t)) or has_intent(t))
