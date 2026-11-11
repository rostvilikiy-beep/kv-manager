import pytest

from leadbot.filters import DEFAULT_STOPWORDS, UserFilter, match, text_hash

F = UserFilter(categories=["site", "landing", "shop", "tgbot"], keywords=[],
               stopwords=DEFAULT_STOPWORDS)

LEADS = [
    "Всем привет! Нужен сайт для кофейни, бюджет 30к",
    "Ищу разработчика, кто может сделать лендинг на тильде?",
    "Подскажите, кто сделает интернет-магазин одежды? Пишите в лс",
    "Нужен телеграм бот для записи клиентов",
    "Требуется сделать сайт-визитку для юриста, срок неделя",
]
NOT_LEADS = [
    "Делаю сайты на Tilda недорого, портфолио в профиле",
    "Беру заказы на лендинги, пишите",
    "Вакансия: веб-разработчик в штат, оклад 150к",
    "Купил ботинки, нужен совет по размеру",
    "Нужен совет по налогам для ИП",
    "Какой сайт лучше для покупки билетов?",
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
