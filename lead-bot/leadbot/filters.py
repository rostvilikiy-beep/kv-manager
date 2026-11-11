"""Фильтрация сообщений: сферы, ключевые слова, стоп-слова, язык, маскировка контактов.

Логика без ИИ:
  сообщение подходит, если в нём есть «маркер запроса» (нужен, ищу, шукаємо, hiring…)
  И слово из выбранной сферы / своё ключевое слово,
  И нет стоп-слов (реклама исполнителей и т.п.).

Синтаксис слов: каждое слово фразы ищется как НАЧАЛО слова
(«мобильн приложен» ловит «мобильное приложение»). Знак $ в конце — слово целиком.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass

# id -> (название, слова). id хранятся в БД, менять их нельзя.
CATEGORIES: dict[str, tuple[str, list[str]]] = {
    "site": ("🌐 Сайты и веб-разработка", [
        "сайт", "вебсайт", "веб-сайт", "website", "веб-разработ", "веб разработ",
        "web develop", "web-develop", "frontend", "фронтенд", "backend", "бекенд", "бэкенд",
        "fullstack", "full-stack", "фулстек", "tilda", "тильд", "тільд", "wordpress",
        "вордпрес", "webflow", "вебфлоу", "битрикс", "бітрікс", "верстк", "верстальщик",
        "react", "vue$", "next.js", "laravel", "django", "php$", "редизайн",
    ]),
    "landing": ("📄 Лендинги", [
        "лендинг", "лендінг", "landing", "одностраничн", "односторінков",
        "посадочн страниц",
    ]),
    "shop": ("🛒 Интернет-магазины", [
        "интернет-магазин", "интернет магазин", "інтернет-магазин", "інтернет магазин",
        "shopify", "woocommerce", "opencart", "хорошоп", "horoshop", "e-commerce", "ecommerce",
    ]),
    "tgbot": ("🤖 Чат-боты", [
        "телеграм бот", "телеграм-бот", "телеграмм бот", "тг бот", "тг-бот", "чат-бот",
        "чатбот", "чат бот", "telegram bot", "mini app", "мини-апп", "міні-апп",
        "бот$", "бота$", "ботов$", "ботів$", "ботика$",
    ]),
    "app": ("📱 Мобильные приложения", [
        "мобильн приложен", "мобільн додат", "мобільний застосун", "додаток для",
        "приложение для", "приложение под", "ios$", "android", "андроид", "андроїд",
        "flutter", "react native", "swift$", "kotlin",
    ]),
    "uiux": ("🎨 UI/UX и веб-дизайн", [
        "ui/ux", "ux/ui", "ui ux", "uiux", "веб-дизайн", "вебдизайн", "web design",
        "дизайн сайт", "дизайн інтерфейс", "дизайн интерфейс", "figma", "фигм", "фігм",
        "макет", "прототип", "product designer", "продуктов дизайнер", "дизайнер",
    ]),
    "branding": ("🔶 Логотип и брендинг", [
        "логотип", "лого$", "logo", "брендинг", "branding", "фирменн стил", "фірмов стил",
        "айдентик", "brand identity", "брендбук", "brandbook",
    ]),
    "seo": ("📈 SEO", [
        "seo", "сео$", "продвижение сайт", "просування сайт", "раскрутк сайт",
    ]),
    "ads": ("🎯 Реклама и таргет", [
        "таргет", "таргетолог", "контекстн реклам", "google ads", "яндекс директ",
        "директолог", "facebook ads", "meta ads", "ppc$", "медиабайер", "медіабаєр",
    ]),
    "smm": ("📣 SMM и контент", [
        "smm", "смм", "сммщик", "контент-менеджер", "контент менеджер", "ведение инстаграм",
        "ведення інстаграм", "ведение соцсет", "ведення соцмереж", "рилс", "reels", "сторис",
    ]),
    "video": ("🎬 Видео и монтаж", [
        "монтаж", "видеомонтаж", "відеомонтаж", "монтажер", "video edit", "моушн",
        "motion", "анимац", "анімац", "видеоролик", "відеоролик",
    ]),
    "copy": ("✍️ Тексты и копирайтинг", [
        "копирайт", "копірайт", "copywrit", "тексты для", "тексти для", "рерайт",
        "статьи для", "статті для",
    ]),
    "automation": ("⚙️ Автоматизация и интеграции", [
        "парсер", "парсинг", "автоматизац", "автоматизув", "интеграц", "інтеграц",
        "crm", "срм$", "amocrm", "kommo", "bitrix24", "n8n", "make.com", "zapier",
        "скрипт", "google sheets", "гугл таблиц",
    ]),
    "ai": ("🧠 AI и нейросети", [
        "нейросет", "нейромереж", "chatgpt", "gpt$", "openai", "ai-агент", "ai агент",
        "ии-агент", "ші-агент", "llm$", "ai bot", "ai-бот", "ии-бот", "промпт",
    ]),
}

# «Кто-то ищет исполнителя / сотрудника» — ru / uk / en
INTENT_MARKERS = [
    # ru
    "нужен", "нужна", "нужно", "нужны", "надо", "ищу", "ищем", "ищется", "требуется",
    "требуются", "кто сделает", "кто может", "кто умеет", "кто занимается",
    "посоветуйте", "порекомендуйте", "подскажите", "есть кто", "заказать", "закажу",
    "хочу заказать", "хочу сделать", "сделать сайт", "сделать бота", "кто возьмется",
    "кто возьмётся", "вакансия", "в команду", "бюджет", "тз$", "оплата",
    # uk
    "потрібен", "потрібна", "потрібно", "потрібні", "треба", "шукаю", "шукаємо",
    "шукають", "хто зробить", "хто може", "хто вміє", "порадьте", "підкажіть",
    "є хтось", "замовити", "хочу замовити", "вакансія",
    # en
    "looking for", "need a", "need an", "need someone", "hiring", "we are hiring",
    "searching for", "vacancy", "job opening", "budget",
]

# Реклама исполнителей и «ищу работу» — по умолчанию отсекаем
DEFAULT_STOPWORDS = [
    "делаю сайты", "создаю сайты", "разрабатываю сайты", "делаю ботов", "делаю лендинг",
    "роблю сайти", "створюю сайти", "розробляю сайти", "роблю ботів",
    "предлагаю услуги", "мои услуги", "наши услуги", "наша студия", "наше агентство",
    "пропоную послуги", "мої послуги", "наші послуги", "наша студія", "наша агенція",
    "портфолио в профиле", "беру заказы", "принимаю заказы", "ищу заказы",
    "ищу клиентов", "ищу работу", "беру замовлення", "шукаю замовлення",
    "шукаю клієнтів", "шукаю роботу", "курс по", "вебинар", "вебінар",
]

_WS = re.compile(r"\s+")


def normalize(text: str) -> str:
    text = (text or "").lower().replace("ё", "е")
    return _WS.sub(" ", text).strip()


def _phrase_regex(phrase: str) -> re.Pattern:
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


def detect_lang(text: str) -> str:
    """Грубое определение языка: uk / ru / en."""
    t = (text or "").lower()
    cyr = len(re.findall(r"[а-яёіїєґ]", t))
    lat = len(re.findall(r"[a-z]", t))
    if cyr == 0 and lat == 0:
        return "ru"
    if lat > cyr * 2:
        return "en"
    uk = len(re.findall(r"[іїєґ]", t))
    ru = len(re.findall(r"[ыэъё]", t))
    return "uk" if uk > ru else "ru"


def text_hash(text: str) -> str:
    """Хеш для дедупликации: один и тот же запрос часто кидают в 10 чатов."""
    t = re.sub(r"[^\w]+", "", normalize(text))
    return hashlib.sha1(t.encode()).hexdigest()


# ---------- контакты ----------
_CONTACT_RX = re.compile(
    r"(?:https?://)?(?:t\.me|telegram\.me|wa\.me|instagram\.com|m\.me)/[\w+/\-?=.]+"
    r"|[\w.+-]+@[\w-]+\.[\w.]{2,}"
    r"|(?<!\w)@[A-Za-z][\w]{3,31}"
    r"|\+?\d[\d\s\-()]{8,}\d",
    re.IGNORECASE,
)


def extract_contacts(text: str) -> list[str]:
    seen, out = set(), []
    for m in _CONTACT_RX.findall(text or ""):
        c = m.strip()
        if c.lower() not in seen:
            seen.add(c.lower())
            out.append(c)
    return out


def mask_contacts(text: str) -> str:
    return _CONTACT_RX.sub("🔒", text or "")


# ---------- проверка под пользователя ----------
@dataclass
class UserFilter:
    categories: list[str]
    keywords: list[str]
    stopwords: list[str]
    require_intent: bool = True
    min_len: int = 15
    max_len: int = 4000


@dataclass
class MatchResult:
    ok: bool
    reason: str
    categories: list[str]
    keyword: str | None = None


def match(text: str, f: UserFilter) -> MatchResult:
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
