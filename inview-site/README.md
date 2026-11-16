# InView Medical — новый сайт

Статический сайт (HTML/CSS/JS, без фреймворков). Можно залить на любой хостинг.

## Как посмотреть локально
```
cd inview-site
python3 -m http.server 8000
```
Открыть http://localhost:8000

## Как править
- Тексты 12 разделов, структура каталога, контакты — в `build.py` (блоки `PERSPECTIVES`, `CATALOG`, `CONTACT`).
- Тексты товаров и статей, выгруженные со старых сайтов, — в `data/source.json`.
- Дизайн — `assets/css/style.css`, анимации и поведение — `assets/js/main.js`.
- После правок: `python3 build.py` пересобирает все страницы.

## Что внутри
- Главная: «Journey through InView», прокрутка-путешествие (Odkrywamy → Wdrażamy → Rozwijamy), 12 perspektyw, каталог, магазин, блог.
- `perspektywy/` — 12 разделов по брифу (View 1 + View 2).
- `katalog/` — весь каталог inviewmedical.pl: 5 категорий, 39 карточек.
- `sklep/` — 17 товаров WzrokOK, покупка в действующем магазине wzrokok.pl.
- `blog/` — 6 статей WzrokOK + 4 новости InView.
- `firma.html`, `kontakt.html`, `kariera.html`, `dokumenty.html`, `404.html`.
- Окно «Czy jesteś profesjonalistą?» (требование закона о медизделиях) — на страницах для специалистов.

## Открытые вопросы
См. `memory/inview-site-decisions.md`.
