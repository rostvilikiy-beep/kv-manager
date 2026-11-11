"""Главное меню и настройки поиска."""
from __future__ import annotations

import html

from aiogram import F, Router
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from ..db import ALL_FORMATS, ALL_KINDS, ALL_LANGS, ALL_SOURCES, User
from ..filters import CATEGORIES, DEFAULT_STOPWORDS
from .common import (BACK_MAIN, BACK_SETTINGS, KB, B, Edit, ctx, fmt_ts, get_user, is_admin,
                     is_pro, on_off, show)

router = Router()

OPTIONS = {
    "categories": ("🔍 Сферы", "Категории услуг, которые тебе интересны.",
                   {k: v[0] for k, v in CATEGORIES.items()}),
    "sources": ("📡 Источники", "Откуда собирать заказы.",
                {"telegram": "💬 Telegram-чаты", "threads": "🧵 Threads"}),
    "langs": ("🌍 Язык заказов", "На каких языках присылать заказы.",
              {"uk": "🇺🇦 Украинский", "ru": "🇷🇺 Русский", "en": "🇬🇧 Английский"}),
    "kinds": ("💼 Заказы или вакансии", "Что именно присылать. Работает с ИИ-фильтром.",
              {"order": "🧩 Разовые заказы", "job": "🏢 Работа в компании"}),
    "formats": ("🏠 Формат работы", "Для вакансий: какие форматы присылать. "
                "Работает с ИИ-фильтром.",
                {"remote": "🌐 Онлайн", "office": "🏢 Офлайн", "hybrid": "🔀 Гибрид"}),
}
assert set(OPTIONS["sources"][2]) == set(ALL_SOURCES)
assert set(OPTIONS["langs"][2]) == set(ALL_LANGS)
assert set(OPTIONS["kinds"][2]) == set(ALL_KINDS)
assert set(OPTIONS["formats"][2]) == set(ALL_FORMATS)


# ---------------- /start, главное меню ----------------
def main_screen(u: User) -> tuple[str, object]:
    pro = is_pro(u)
    if u.is_pro:
        plan = f"💎 Pro до {fmt_ts(u.plan_until)}"
    elif pro:
        plan = "💎 Pro (админ)"
    else:
        plan = f"🆓 Бесплатный — заказы с задержкой {ctx.cfg.free_delay_hours:g} ч"
    cats = len(u.categories)
    text = (
        "<b>🎯 Поиск заказов</b>\n\n"
        f"Статус: {'🟢 ищу заказы' if u.active else '⏸ на паузе'}\n"
        f"Тариф: {plan}\n"
        f"Сфер выбрано: {cats} из {len(CATEGORIES)}"
    )
    rows = []
    if not pro:
        rows.append([B("⚡ Открой полный доступ — мгновенные заказы", "m:profile")])
    rows += [
        [B("📰 Лента заказов", "m:feed"), B("⭐ Сохранённые", "m:saved")],
        [B("⚙️ Настройки поиска", "m:settings")],
        [B("👤 Профиль и подписка", "m:profile"), B("🎁 Рефералы", "m:refs")],
        [B("▶️ Включить поиск" if not u.active else "⏸ Пауза", "t:active"),
         B("❓ Помощь", "m:help")],
    ]
    if is_admin(u.id):
        rows.append([B("👑 Админка", "m:admin")])
    return text, KB(*rows)


async def handle_referral(u: User, created: bool, arg: str | None, bot) -> None:
    if not (created and arg and arg.startswith("ref_") and arg[4:].isdigit()):
        return
    ref_id = int(arg[4:])
    if ref_id == u.id or not await ctx.db.get_user(ref_id):
        return
    await ctx.db.update(u.id, ref_by=ref_id)
    days = ctx.cfg.ref_bonus_days
    if days > 0:
        until = await ctx.db.add_pro_days(ref_id, days)
        await ctx.db.make_due_now(ref_id)
        try:
            await bot.send_message(ref_id, f"🎁 По твоей ссылке пришёл новый пользователь! "
                                           f"+{days} дн. Pro (до {fmt_ts(until)}).")
        except Exception:
            pass


@router.message(CommandStart())
async def cmd_start(m: Message, state: FSMContext, command: CommandObject) -> None:
    await state.clear()
    if not ctx.cfg.can_use(m.from_user.id):
        await m.answer(f"⛔ Доступ закрыт. Твой ID: <code>{m.from_user.id}</code> — "
                       "попроси владельца добавить его в ALLOWED_USER_IDS.")
        return
    u, created = await ctx.db.ensure_user(m.from_user.id, m.from_user.username,
                                          m.from_user.first_name)
    await handle_referral(u, created, command.args, m.bot)
    if created:
        await m.answer(
            "👋 Привет! Я присылаю заказы и вакансии из Telegram-чатов и Threads — "
            "как только кто-то пишет, что ему нужен исполнитель.\n\n"
            "Сначала выбери сферы, которые тебе интересны 👇")
        await show_multi(m, u, "categories")
        return
    await show(m, *main_screen(u))


@router.message(Command("menu"))
async def cmd_menu(m: Message, state: FSMContext) -> None:
    await state.clear()
    if u := await get_user(m):
        await show(m, *main_screen(u))


@router.callback_query(F.data == "m:main")
async def cb_main(c: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    if u := await get_user(c):
        await show(c, *main_screen(u))


@router.callback_query(F.data.startswith("t:"))
async def cb_toggle(c: CallbackQuery) -> None:
    u = await get_user(c)
    if not u:
        return
    col = c.data[2:]
    if col == "ai_filter" and not ctx.cfg.ai_available:
        await c.answer("ИИ не настроен: нужен ANTHROPIC_API_KEY в .env", show_alert=True)
        return
    await ctx.db.update(u.id, **{col: not getattr(u, col)})
    u = await ctx.db.get_user(u.id)
    if col == "active":
        await show(c, *main_screen(u))
    else:
        await show(c, *settings_screen(u))


# ---------------- настройки ----------------
def settings_screen(u: User) -> tuple[str, object]:
    def picked(col):
        return f"{len(getattr(u, col))}/{len(OPTIONS[col][2])}"

    ai = on_off(u.ai_filter) if ctx.cfg.ai_available else "не настроен"
    text = (
        "<b>⚙️ Настройки поиска</b>\n\n"
        f"🔍 Сферы: {picked('categories')}\n"
        f"📡 Источники: {', '.join(OPTIONS['sources'][2][s] for s in u.sources) or '—'}\n"
        f"🌍 Языки: {' '.join(s.upper() for s in u.langs) or '—'}\n"
        f"💼 Тип: {', '.join(OPTIONS['kinds'][2][s] for s in u.kinds) or '—'}\n"
        f"🖼 Оформление: {'кратко (ИИ)' if u.card_style == 'short' else 'полный текст'}\n"
        f"🔑 Свои слова: {len(u.keywords)}   🚫 Чёрный список: {len(u.stopwords)}\n"
        f"🤖 ИИ-фильтр: {ai}"
    )
    kb = KB(
        [B("🔍 Сферы", "ms:categories"), B("📡 Источники", "ms:sources")],
        [B("🌍 Язык заказов", "ms:langs"), B("💼 Заказы / вакансии", "ms:kinds")],
        [B("🏠 Формат работы", "ms:formats"), B("🖼 Оформление", "m:style")],
        [B("🔑 Ключевые слова", "m:kw"), B("🚫 Чёрный список", "m:stop")],
        [B("➕ Свои группы", "m:groups"), B("✍️ Генерация откликов", "m:about")],
        [B(f"🤖 ИИ-фильтр {on_off(u.ai_filter)}", "t:ai_filter")],
        BACK_MAIN,
    )
    return text, kb


@router.callback_query(F.data == "m:settings")
async def cb_settings(c: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    if u := await get_user(c):
        await show(c, *settings_screen(u))


# ---------------- мультивыбор (сферы, источники, языки…) ----------------
async def show_multi(target, u: User, col: str) -> None:
    title, hint, opts = OPTIONS[col]
    chosen = getattr(u, col)
    rows, row = [], []
    per_row = 2 if col == "categories" else 1
    for key, label in opts.items():
        row.append(B(f"{'✅' if key in chosen else '▫️'} {label}", f"mt:{col}:{key}"))
        if len(row) == per_row:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    if col == "categories":
        rows.append([B("✅ Все", f"mt:{col}:*all"), B("▫️ Ничего", f"mt:{col}:*none")])
        rows.append([B("💾 Готово", "m:main")])
    else:
        rows.append(BACK_SETTINGS)
    warn = "\n\n⚠️ Ничего не выбрано — заказы приходить не будут." if not chosen else ""
    if col == "sources" and not ctx.cfg.threads_available:
        warn += "\n\nℹ️ Threads пока не подключён администратором."
    if col in ("kinds", "formats") and not ctx.cfg.ai_available:
        warn += "\n\nℹ️ ИИ не настроен — этот фильтр пока не применяется."
    await show(target, f"<b>{title}</b>\n\n{hint}{warn}", KB(*rows))


@router.callback_query(F.data.startswith("ms:"))
@router.callback_query(F.data == "m:cats!")
async def cb_multi(c: CallbackQuery) -> None:
    if u := await get_user(c):
        await show_multi(c, u, "categories" if c.data == "m:cats!" else c.data[3:])


@router.callback_query(F.data.startswith("mt:"))
async def cb_multi_toggle(c: CallbackQuery) -> None:
    u = await get_user(c)
    if not u:
        return
    _, col, key = c.data.split(":", 2)
    opts = OPTIONS[col][2]
    cur = list(getattr(u, col))
    if key == "*all":
        cur = list(opts)
    elif key == "*none":
        cur = []
    elif key in opts:
        cur = [x for x in cur if x != key] if key in cur else cur + [key]
    await ctx.db.update(u.id, **{col: cur})
    await show_multi(c, await ctx.db.get_user(u.id), col)


# ---------------- оформление ----------------
@router.callback_query(F.data.startswith("m:style"))
async def cb_style(c: CallbackQuery) -> None:
    u = await get_user(c)
    if not u:
        return
    if ":" in c.data[2:]:
        await ctx.db.update(u.id, card_style=c.data.split(":")[-1])
        u = await ctx.db.get_user(u.id)
    mark = lambda s: "🔘" if u.card_style == s else "⚪️"  # noqa: E731
    await show(c, "<b>🖼 Оформление заказов</b>\n\n"
               "<b>Кратко</b> — ИИ пишет заголовок и выжимку (как в примере выше).\n"
               "<b>Полный текст</b> — заголовок + оригинальное сообщение целиком.",
               KB([B(f"{mark('short')} Кратко", "m:style:short")],
                  [B(f"{mark('full')} Полный текст", "m:style:full")],
                  BACK_SETTINGS))


# ---------------- ключевые слова / чёрный список ----------------
LIST_INFO = {
    "kw": ("keywords", Edit.keywords, "🔑 Свои ключевые слова",
           "Слова и фразы, по которым тоже присылать заказы (в дополнение к сферам). "
           "Например: <i>nuxt, вёрстка, figma в код</i>.\n"
           "Совпадение по началу слова: «вёрстк» поймает «вёрстка», «вёрстку». "
           "$ в конце — слово целиком: <i>vue$</i>"),
    "stop": ("stopwords", Edit.stopwords, "🚫 Чёрный список слов",
             "Заказы с этими словами не приходят. Например: <i>крипта, бесплатно, за отзыв</i>.\n"
             f"Плюс {len(DEFAULT_STOPWORDS)} встроенных фраз, отсекающих рекламу исполнителей "
             "(«делаю сайты», «беру заказы», «ищу работу»…)."),
}


async def show_list(target, u: User, key: str) -> None:
    column, _, title, hint = LIST_INFO[key]
    items: list[str] = getattr(u, column)
    body = "\n".join(f"• <code>{html.escape(w)}</code>" for w in items) or "<i>пусто</i>"
    rows = [[B(f"❌ {w[:25]}", f"d:{key}:{i}")] for i, w in enumerate(items[:30])]
    rows.append([B("🗑 Очистить всё", f"d:{key}:*")] if items else [])
    rows.append(BACK_SETTINGS)
    await show(target, f"<b>{title}</b>\n\n{hint}\n\n{body}\n\n"
               "✍️ Пришли слова сообщением — через запятую или каждое с новой строки. "
               "Нажми на слово, чтобы удалить.", KB(*rows))


@router.callback_query(F.data.in_({"m:kw", "m:stop"}))
async def cb_list(c: CallbackQuery, state: FSMContext) -> None:
    if u := await get_user(c):
        key = c.data[2:]
        await state.set_state(LIST_INFO[key][1])
        await show_list(c, u, key)


@router.callback_query(F.data.startswith("d:"))
async def cb_del_word(c: CallbackQuery) -> None:
    u = await get_user(c)
    if not u:
        return
    _, key, idx = c.data.split(":", 2)
    column = LIST_INFO[key][0]
    items = list(getattr(u, column))
    if idx == "*":
        items = []
    elif idx.isdigit() and int(idx) < len(items):
        items.pop(int(idx))
    await ctx.db.update(u.id, **{column: items})
    await show_list(c, await ctx.db.get_user(u.id), key)


@router.message(Edit.keywords, F.text & ~F.text.startswith("/"))
@router.message(Edit.stopwords, F.text & ~F.text.startswith("/"))
async def on_words(m: Message, state: FSMContext) -> None:
    u = await get_user(m)
    if not u:
        return
    key = "kw" if await state.get_state() == Edit.keywords.state else "stop"
    column = LIST_INFO[key][0]
    new = [w.strip().lower() for w in m.text.replace("\n", ",").split(",")]
    new = [w for w in new if 2 <= len(w) <= 60]
    items = list(dict.fromkeys(getattr(u, column) + new))[:100]
    await ctx.db.update(u.id, **{column: items})
    await show_list(m, await ctx.db.get_user(u.id), key)


# ---------------- о себе (для генерации откликов) ----------------
@router.callback_query(F.data == "m:about")
async def cb_about(c: CallbackQuery, state: FSMContext) -> None:
    u = await get_user(c)
    if not u:
        return
    await state.set_state(Edit.about)
    cur = html.escape(u.reply_prompt) if u.reply_prompt else "<i>не заполнено</i>"
    pro_note = "" if is_pro(u) else "\n\n🔒 Генерация откликов доступна в Pro."
    await show(c, "<b>✍️ Генерация откликов</b>\n\n"
               "Под каждым заказом есть кнопка «✍️ Отклик» — ИИ напишет черновик ответа "
               "заказчику от твоего имени. Чтобы отклик был точным, расскажи о себе: "
               "чем занимаешься, опыт, стек, ссылка на портфолио, как любишь общаться."
               f"{pro_note}\n\n<b>Сейчас:</b>\n{cur}\n\n✍️ Пришли текст сообщением, чтобы заменить.",
               KB(BACK_SETTINGS))


@router.message(Edit.about, F.text & ~F.text.startswith("/"))
async def on_about(m: Message, state: FSMContext) -> None:
    if u := await get_user(m):
        await ctx.db.update(u.id, reply_prompt=m.text[:2000])
        await state.clear()
        await m.answer("✅ Сохранил. Теперь отклики будут учитывать это.",
                       reply_markup=KB(BACK_SETTINGS))


# ---------------- свои группы ----------------
def group_limit(u: User) -> int:
    return 20 if is_pro(u) else 2


async def show_groups(target, u: User) -> None:
    chats = await ctx.db.user_chats(u.id)
    body = "\n".join(f"• {html.escape(ch['title'] or str(ch['chat_id']))}" for ch in chats) \
        or "<i>пока нет</i>"
    rows = [[B(f"❌ {(ch['title'] or '')[:30]}", f"gx:{ch['chat_id']}")] for ch in chats]
    rows.append(BACK_SETTINGS)
    note = "" if ctx.userbot else "\n\n⚠️ Юзербот сейчас не запущен — добавить группу нельзя."
    await show(target, "<b>➕ Свои группы</b>\n\n"
               "Telegram-чаты, которые бот будет мониторить персонально для тебя: заказы "
               "из них получаешь только ты.\n"
               f"Лимит: {len(chats)}/{group_limit(u)}"
               f"{'' if is_pro(u) else ' (в Pro — до 20)'}\n\n{body}\n\n"
               "✍️ Пришли ссылку на чат: <code>@chatname</code>, <code>https://t.me/chatname</code> "
               f"или ссылку-приглашение.{note}", KB(*rows))


@router.callback_query(F.data == "m:groups")
async def cb_groups(c: CallbackQuery, state: FSMContext) -> None:
    if u := await get_user(c):
        await state.set_state(Edit.group)
        await show_groups(c, u)


@router.message(Edit.group, F.text & ~F.text.startswith("/"))
async def on_group(m: Message) -> None:
    u = await get_user(m)
    if not u:
        return
    if not ctx.userbot:
        await m.answer("Юзербот не запущен, попробуй позже.")
        return
    if len(await ctx.db.user_chats(u.id)) >= group_limit(u):
        await m.answer("Лимит групп исчерпан. Удали ненужную или оформи Pro.")
        return
    chat_id, info, already = await ctx.userbot.join(m.text)
    if chat_id is None:
        await m.answer(html.escape(info))
        return
    # Чат, в котором юзербот уже состоял «для всех», остаётся общим
    if already and not await ctx.db.chat_known(chat_id):
        await ctx.db.add_chat(chat_id, 0, info)
    await ctx.db.add_chat(chat_id, u.id, info)
    await m.answer(f"✅ Добавил «{html.escape(info)}». Слежу за новыми сообщениями.")
    await show_groups(m, u)


@router.callback_query(F.data.startswith("gx:"))
async def cb_group_del(c: CallbackQuery) -> None:
    u = await get_user(c)
    if not u:
        return
    chat_id = int(c.data[3:])
    await ctx.db.remove_chat(chat_id, u.id)
    if ctx.userbot and await ctx.db.chat_owner_count(chat_id) == 0:
        await ctx.userbot.leave_by_id(chat_id)
    await show_groups(c, u)


# ---------------- помощь ----------------
HELP = """<b>❓ Как это работает</b>

Я читаю Telegram-чаты (фриланс, бизнес, предприниматели…) и Threads. \
Когда кто-то пишет, что ему нужен исполнитель — сайт, бот, дизайн, логотип, SMM и т.д. — \
тебе приходит карточка заказа.

<b>Карточка:</b> заголовок и суть от ИИ, дата, источник, сфера.
🔑 <b>Открыть контакты</b> — кто написал и как связаться.
🔍 <b>Открыть заказ</b> — оригинальное сообщение.
⭐ <b>Сохранить</b> · ✍️ <b>Отклик</b> — ИИ напишет черновик ответа.

<b>Бесплатно:</b> заказы приходят через {delay} ч, контакты — {contacts} раз в сутки.
<b>Pro:</b> заказ у тебя через секунду после публикации, контакты без лимита, отклики от ИИ.

/menu — главное меню"""


@router.callback_query(F.data == "m:help")
async def cb_help(c: CallbackQuery) -> None:
    await show(c, HELP.format(delay=f"{ctx.cfg.free_delay_hours:g}",
                              contacts=ctx.cfg.free_contacts_per_day), KB(BACK_MAIN))
