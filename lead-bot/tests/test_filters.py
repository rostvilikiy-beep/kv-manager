import pytest

from leadbot.filters import (CATEGORIES, DEFAULT_STOPWORDS, UserFilter, detect_lang,
                             extract_contacts, mask_contacts, match, text_hash)

F = UserFilter(categories=list(CATEGORIES), keywords=[], stopwords=DEFAULT_STOPWORDS)

LEADS = [
    "Всем привет! Нужен сайт для кофейни, бюджет 30к",
    "Ищу разработчика, кто может сделать лендинг на тильде?",
    "Подскажите, кто сделает интернет-магазин одежды? Пишите в лс",
    "Нужен телеграм бот для записи клиентов",
    "Треба зробити телеграм бота з широким спектром функцій",
    "Потрібен фахівець для термінового виконання задачі: брендинг та логотип",
    "Шукають UI/UX Designer (Middle+) для роботи над веб- та мобільними платформами",
    "Вакансия: веб-разработчик в штат, оклад 150к",
    "We are hiring a Webflow developer for a landing page",
]
NOT_LEADS = [
    "Делаю сайты на Tilda недорого, портфолио в профиле",
    "Беру заказы на лендинги, пишите",
    "Роблю сайти під ключ, пишіть",
    "Купил ботинки, нужен совет по размеру",
    "Нужен совет по налогам для ИП",
    "Какой сайт лучше для покупки билетов?",
    "Ищу работу веб-дизайнером, опыт 3 года",
]


@pytest.mark.parametrize("text", LEADS)
def test_leads_match(text):
    assert match(text, F).ok, match(text, F)


@pytest.mark.parametrize("text", NOT_LEADS)
def test_not_leads(text):
    assert not match(text, F).ok, text


def test_category_off():
    f = UserFilter(categories=["tgbot"], keywords=[], stopwords=[])
    assert not match("Нужен сайт для кофейни, срочно", f).ok
    assert match("Нужен бот для магазина цветов", f).ok


def test_custom_keyword_without_intent():
    f = UserFilter(categories=[], keywords=["vue$"], stopwords=[])
    assert match("Есть проект на Vue, интересно?", f).ok
    assert not match("Есть проект на Vuetify, интересно?", f).ok


def test_user_stopword():
    f = UserFilter(categories=["site"], keywords=[], stopwords=["бесплатно"])
    assert not match("Нужен сайт бесплатно, за отзыв", f).ok


def test_dedup_hash_ignores_punctuation():
    assert text_hash("Нужен сайт!!!") == text_hash("нужен   сайт")


@pytest.mark.parametrize("text,lang", [
    ("Треба зробити телеграм бота з широким спектром функцій", "uk"),
    ("Нужен сайт для кофейни, бюджет 30к", "ru"),
    ("We are hiring a Webflow developer", "en"),
])
def test_detect_lang(text, lang):
    assert detect_lang(text) == lang


def test_contacts():
    t = "Пишите @ivan_dev или +38 (067) 123-45-67, почта a.b@mail.com, t.me/ivan"
    found = extract_contacts(t)
    assert "@ivan_dev" in found and "a.b@mail.com" in found and "t.me/ivan" in found
    assert any("067" in x for x in found)
    masked = mask_contacts(t)
    assert "ivan_dev" not in masked and "067" not in masked and "mail.com" not in masked
