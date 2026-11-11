"""Бот-интерфейс (aiogram): меню настроек, карточки лидов, админ-команды."""
from __future__ import annotations

import html
import logging
from typing import TYPE_CHECKING

from aiogram import Bot, Dispatcher, F, Router
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup,
                           Message)

from .config import Config
from .db import DB, User
from .filters import CATEGORIES, DEFAULT_STOPWORDS
from .pipeline import Lead

if TYPE_CHECKING:
    from .pipeline import Pipeline
    from .threads_source import ThreadsSource
    from .userbot import UserBot

log = logging.getLogger(__name__)
router = Router()


class Edit(StatesGroup):
    keywords = State()
    stopwords = State()


def B(text: str, data: str | None = None, url: str | None = None) -> InlineKeyboardButton:
    return InlineKeyboardButton(text=text, callback_data=data, url=url)


def on_off(v: bool) -> str:
    return "✅" if v else "❌"


# ---------------- общий контекст ----------------
class Ctx:
    cfg: Config
    db: DB
    pipeline: "Pipeline"
    userbot: "UserBot | None" = None
    threads: "ThreadsSource | None" = None


ctx = Ctx()


async def _user(obj: Message | CallbackQuery) -> User | None:
    u = obj.from_user
    if not ctx.cfg.can_use(u.id):
        return None
    return await ctx.db.ensure_user(u.id, u.username)


# ---------------- главное меню ----------------
def main_menu(u: User, is_admin: bool) -> tuple[str, InlineKeyboardMarkup]:
    cats = ", ".join(CATEGORIES[c][0] for c in u.categories if c in CATEGORIES) or "—"
    text = (
        "<b>🎯 Поиск заказов</b>\n\n"
        f"Статус: {'🟢 ищу заказы' if u.active else '⏸ на паузе'}\n"
        f"Категории: {cats}\n"
        f"Свои ключевые слова: {len(u.keywords)}\n"
        f"Стоп-слова: {len(u.stopwords)} (+ {len(DEFAULT_STOPWORDS)} встроенных)\n"
        f"ИИ-фильтр: {on_off(u.ai_filter) if ctx.cfg.ai_available else 'не настроен'}\n"
        f"Источники: Telegram {on_off(u.src_telegram)}  Threads {on_off(u.src_threads)}"
    )
    rows = [
        [B("🔍 Что искать", "m:cats"), B("🔑 Ключевые слова", "m:kw")],
        [B("🚫 Стоп-слова", "m:stop"), B("📡 Источники", "m:src")],
        [B(f"🤖 ИИ-фильтр {on_off(u.ai_filter)}", "t:ai_filter"),
         B("▶️ Включить" if not u.active else "⏸ Пауза", "t:active")],
        [B("📊 Статистика", "m:stats"), B("❓ Помощь", "m:help")],
    ]
    if is_admin:
        rows.append([B("👑 Админка", "m:admin")])
    return text, InlineKeyboardMarkup(inline_keyboard=rows)


async def show_main(target: Message | CallbackQuery, u: User) -> None:
    text, kb = main_menu(u, target.from_user.id in ctx.cfg.admin_ids)
    if isinstance(target, CallbackQuery):
        await target.message.edit_text(text, reply_markup=kb)
        await target.answer()
    else:
        await target.answer(text, reply_markup=kb)


@router.message(CommandStart())
async def cmd_start(m: Message, state: FSMContext) -> None:
    await state.clear()
    u = await _user(m)
    if not u:
        await m.answer(f"⛔ Доступ закрыт. Твой ID: <code>{m.from_user.id}</code> — "
                       "попроси владельца добавить его в ALLOWED_USER_IDS.")
        return
    await show_main(m, u)


@router.message(Command("menu"))
async def cmd_menu(m: Message, state: FSMContext) -> None:
    await cmd_start(m, state)


@router.callback_query(F.data == "m:main")
async def cb_main(c: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    if u := await _user(c):
        await show_main(c, u)


@router.callback_query(F.data.startswith("t:"))
async def cb_toggle(c: CallbackQuery) -> None:
    u = await _user(c)
    if not u:
        return
    col = c.data[2:]
    if col == "ai_filter" and not ctx.cfg.ai_available:
        await c.answer("ИИ не настроен: нужен ANTHROPIC_API_KEY в .env", show_alert=True)
        return
    await ctx.db.set_flag(u.id, col, not getattr(u, col))
    u = await ctx.db.get_user(u.id)
    if col.startswith("src_"):
        await show_sources(c, u)
    else:
        await show_main(c, u)


# ---------------- категории ----------------
@router.callback_query(F.data == "m:cats")
async def cb_cats(c: CallbackQuery) -> None:
    if u := await _user(c):
        await show_cats(c, u)


async def show_cats(c: CallbackQuery, u: User) -> None:
    rows, row = [], []
    for cid, (title, _) in CATEGORIES.items():
        row.append(B(f"{'✅' if cid in u.categories else '▫️'} {title}", f"c:{cid}"))
        if len(row) == 2:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    rows.append([B("✅ Все", "c:*all"), B("▫️ Ничего", "c:*none")])
    rows.append([B("⬅️ Назад", "m:main")])
    await c.message.edit_text(
        "<b>🔍 Что искать</b>\n\nОтметь категории заказов, которые тебе интересны. "
        "Внутри каждой — набор слов-синонимов (сайт, лендинг, tilda…).",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=rows))
    await c.answer()


@router.callback_query(F.data.startswith("c:"))
async def cb_cat_toggle(c: CallbackQuery) -> None:
    u = await _user(c)
    if not u:
        return
    cid = c.data[2:]
    if cid == "*all":
        cats = list(CATEGORIES)
    elif cid == "*none":
        cats = []
    else:
        cats = [x for x in u.categories if x != cid] if cid in u.categories else u.categories + [cid]
    await ctx.db.set_list(u.id, "categories", cats)
    await show_cats(c, await ctx.db.get_user(u.id))


# ---------------- ключевые / стоп-слова ----------------
LIST_INFO = {
    "kw": ("keywords", Edit.keywords, "🔑 Свои ключевые слова",
           "Слова и фразы, по которым тоже присылать заказы (в дополнение к категориям). "
           "Например: <i>nuxt, вёрстка, figma в код</i>.\n"
           "Совпадение по началу слова: «вёрстк» поймает «вёрстка», «вёрстку».\n"
           "Добавь $ в конце, чтобы искать слово целиком: <i>vue$</i>"),
    "stop": ("stopwords", Edit.stopwords, "🚫 Стоп-слова",
             "Если в сообщении есть такое слово — оно не придёт. "
             "Например: <i>бесплатно, за отзыв, вакансия</i>.\n"
             "Встроенные стоп-слова уже отсекают типичную рекламу исполнителей."),
}


@router.callback_query(F.data.in_({"m:kw", "m:stop"}))
async def cb_list(c: CallbackQuery, state: FSMContext) -> None:
    u = await _user(c)
    if not u:
        return
    key = c.data[2:]
    column, st, title, hint = LIST_INFO[key]
    await state.set_state(st)
    await show_list(c.message, u, key, edit=True)
    await c.answer("Пришли слова сообщением")


async def show_list(msg: Message, u: User, key: str, edit: bool) -> None:
    column, _, title, hint = LIST_INFO[key]
    items: list[str] = getattr(u, column)
    body = "\n".join(f"• <code>{html.escape(w)}</code>" for w in items) or "<i>пусто</i>"
    rows = [[B(f"❌ {w[:20]}", f"d:{key}:{i}")] for i, w in enumerate(items[:30])]
    rows.append([B("🗑 Очистить всё", f"d:{key}:*"), B("⬅️ Готово", "m:main")])
    text = (f"<b>{title}</b>\n\n{hint}\n\n{body}\n\n"
            "✍️ Пришли новые слова — через запятую или каждое с новой строки. "
            "Нажми на слово ниже, чтобы удалить.")
    kb = InlineKeyboardMarkup(inline_keyboard=rows)
    if edit:
        await msg.edit_text(text, reply_markup=kb)
    else:
        await msg.answer(text, reply_markup=kb)


@router.callback_query(F.data.startswith("d:"))
async def cb_del_word(c: CallbackQuery) -> None:
    u = await _user(c)
    if not u:
        return
    _, key, idx = c.data.split(":", 2)
    column = LIST_INFO[key][0]
    items: list[str] = list(getattr(u, column))
    if idx == "*":
        items = []
    elif idx.isdigit() and int(idx) < len(items):
        items.pop(int(idx))
    await ctx.db.set_list(u.id, column, items)
    await show_list(c.message, await ctx.db.get_user(u.id), key, edit=True)
    await c.answer("Удалено")


@router.message(Edit.keywords, F.text & ~F.text.startswith("/"))
@router.message(Edit.stopwords, F.text & ~F.text.startswith("/"))
async def on_words(m: Message, state: FSMContext) -> None:
    u = await _user(m)
    if not u:
        return
    key = "kw" if await state.get_state() == Edit.keywords.state else "stop"
    column = LIST_INFO[key][0]
    new = [w.strip().lower() for w in m.text.replace("\n", ",").split(",")]
    new = [w for w in new if 2 <= len(w) <= 60]
    items = list(dict.fromkeys(getattr(u, column) + new))[:100]
    await ctx.db.set_list(u.id, column, items)
    await show_list(m, await ctx.db.get_user(u.id), key, edit=False)


# ---------------- источники ----------------
@router.callback_query(F.data == "m:src")
async def cb_src(c: CallbackQuery) -> None:
    if u := await _user(c):
        await show_sources(c, u)


async def show_sources(c: CallbackQuery, u: User) -> None:
    th_note = "" if ctx.cfg.threads_available else "\n\n⚠️ Threads не подключён (нет THREADS_ACCESS_TOKEN)."
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [B(f"{on_off(u.src_telegram)} Telegram-чаты", "t:src_telegram")],
        [B(f"{on_off(u.src_threads)} Threads", "t:src_threads")],
        [B("⬅️ Назад", "m:main")],
    ])
    await c.message.edit_text("<b>📡 Откуда присылать заказы</b>" + th_note, reply_markup=kb)
    await c.answer()


# ---------------- статистика / помощь ----------------
@router.callback_query(F.data == "m:stats")
async def cb_stats(c: CallbackQuery) -> None:
    u = await _user(c)
    if not u:
        return
    s = await ctx.db.stats(u.id)
    p = ctx.pipeline.stats
    text = (
        "<b>📊 Статистика</b>\n\n"
        f"Заказов за сутки: <b>{s['today']}</b>\n"
        f"За неделю: <b>{s['week']}</b>\n"
        f"Всего: <b>{s['all']}</b>\n"
        f"Твои оценки: 👍 {s['good']}  👎 {s['bad']}\n\n"
        f"<i>С момента запуска: просмотрено {p['seen']} сообщений, "
        f"подошло по словам {p['matched']}, ИИ отсеял {p['ai_rejected']}.</i>"
    )
    await c.message.edit_text(text, reply_markup=InlineKeyboardMarkup(
        inline_keyboard=[[B("⬅️ Назад", "m:main")]]))
    await c.answer()


HELP = """<b>❓ Как это работает</b>

Бот читает Telegram-чаты (фриланс, бизнес, предприниматели и т.д.) и Threads. \
Когда кто-то пишет, что ему нужен сайт, бот или другая услуга — карточка заказа сразу приходит сюда.

<b>Фильтры:</b>
• <b>Что искать</b> — категории заказов
• <b>Ключевые слова</b> — свои слова в дополнение к категориям
• <b>Стоп-слова</b> — что точно не присылать
• <b>ИИ-фильтр</b> — нейросеть отсекает рекламу исполнителей, вакансии и спам

Под каждой карточкой жми 👍/👎 — так видно, насколько точно работает поиск.

Команды: /menu — меню"""


@router.callback_query(F.data == "m:help")
async def cb_help(c: CallbackQuery) -> None:
    await c.message.edit_text(HELP, reply_markup=InlineKeyboardMarkup(
        inline_keyboard=[[B("⬅️ Назад", "m:main")]]))
    await c.answer()


# ---------------- карточка лида ----------------
def render_lead(lead: Lead) -> tuple[str, InlineKeyboardMarkup]:
    m, v = lead.msg, lead.verdict
    cat_id = (v.category if v and v.category in CATEGORIES else
              (lead.categories[0] if lead.categories else None))
    cat = CATEGORIES[cat_id][0] if cat_id else "🔎 По ключевому слову"
    src = "🧵 Threads" if m.source == "threads" else f"💬 {html.escape(m.chat or 'Telegram')}"
    body = html.escape(m.text if len(m.text) <= 1500 else m.text[:1500] + "…")

    lines = [f"🔥 <b>Новый заказ</b> · {cat}", "", f"<blockquote>{body}</blockquote>"]
    if v:
        lines.append(f"🧠 <b>Суть:</b> {html.escape(v.need or v.summary)}")
        if v.budget:
            lines.append(f"💰 <b>Бюджет:</b> {html.escape(v.budget)}")
        if v.deadline:
            lines.append(f"⏰ <b>Срок:</b> {html.escape(v.deadline)}")
    if lead.keyword:
        lines.append(f"🔑 Слово: <code>{html.escape(lead.keyword.rstrip('$'))}</code>")
    author = html.escape(m.author or "аноним")
    lines.append(f"👤 {author}  ·  {src}")

    rows = []
    links = []
    if m.url:
        links.append(B("🔗 Открыть", url=m.url))
    if m.author_url and m.author_url.startswith("http"):
        links.append(B("✉️ Написать", url=m.author_url))
    if links:
        rows.append(links)
    rows.append([B("👍 Подходит", f"f:{lead.id}:1"), B("👎 Мимо", f"f:{lead.id}:-1")])
    return "\n".join(lines), InlineKeyboardMarkup(inline_keyboard=rows)


def make_notifier(bot: Bot):
    async def notify(u: User, lead: Lead) -> None:
        text, kb = render_lead(lead)
        await bot.send_message(u.id, text, reply_markup=kb, disable_web_page_preview=True)
    return notify


@router.callback_query(F.data.startswith("f:"))
async def cb_feedback(c: CallbackQuery) -> None:
    _, lead_id, val = c.data.split(":")
    await ctx.db.set_feedback(c.from_user.id, int(lead_id), int(val))
    kb = c.message.reply_markup
    if kb:  # убираем кнопки оценки, ссылки оставляем
        kb = InlineKeyboardMarkup(inline_keyboard=[
            r for r in kb.inline_keyboard if not (r and (r[0].callback_data or "").startswith("f:"))])
        await c.message.edit_reply_markup(reply_markup=kb)
    await c.answer("Спасибо! 👍" if val == "1" else "Учту 👎")


# ---------------- админка ----------------
ADMIN_HELP = """<b>👑 Админка</b>

<b>Telegram-чаты</b> (юзербот читает все группы, в которых состоит):
/join <code>@chat</code> или ссылка — вступить в чат
/leave <code>@chat</code> — выйти из чата
/chats — список чатов, которые слушаем

<b>Threads</b> — поисковые запросы:
/tq — список запросов
/tq_add <code>нужен сайт</code> — добавить
/tq_del <code>нужен сайт</code> — удалить

⚠️ Вступай не больше 10–20 чатов в день — иначе Telegram может ограничить аккаунт."""


def _is_admin(uid: int) -> bool:
    return uid in ctx.cfg.admin_ids


@router.callback_query(F.data == "m:admin")
async def cb_admin(c: CallbackQuery) -> None:
    if not _is_admin(c.from_user.id):
        await c.answer()
        return
    status = [
        f"Юзербот: {'🟢 работает' if ctx.userbot else '🔴 не запущен'}",
        f"Threads: {'🟢 подключён' if ctx.threads else '⚪️ не настроен'}",
        f"ИИ: {'🟢 ' + ctx.cfg.claude_model if ctx.cfg.ai_available else '⚪️ не настроен'}",
    ]
    if ctx.threads and ctx.threads.last_error:
        status.append(f"⚠️ Threads ошибка: {html.escape(ctx.threads.last_error[:200])}")
    await c.message.edit_text(ADMIN_HELP + "\n\n" + "\n".join(status),
                              reply_markup=InlineKeyboardMarkup(
                                  inline_keyboard=[[B("⬅️ Назад", "m:main")]]))
    await c.answer()


@router.message(Command("join", "leave"))
async def cmd_join(m: Message, command: CommandObject) -> None:
    if not _is_admin(m.from_user.id):
        return
    if not ctx.userbot:
        await m.answer("Юзербот не запущен")
        return
    if not command.args:
        await m.answer(f"Пример: /{command.command} @chatname")
        return
    fn = ctx.userbot.join if command.command == "join" else ctx.userbot.leave
    await m.answer(html.escape(await fn(command.args)))


@router.message(Command("chats"))
async def cmd_chats(m: Message) -> None:
    if not _is_admin(m.from_user.id) or not ctx.userbot:
        return
    chats = await ctx.userbot.list_chats()
    text = "\n".join(f"• {html.escape(c)}" for c in chats) or "Юзербот пока ни в одном чате. /join @chat"
    await m.answer(f"<b>Слушаю {len(chats)} чатов:</b>\n{text}"[:4000])


@router.message(Command("tq", "tq_add", "tq_del"))
async def cmd_tq(m: Message, command: CommandObject) -> None:
    if not _is_admin(m.from_user.id):
        return
    q = (command.args or "").strip().lower()
    if command.command == "tq_add" and q:
        await ctx.db.add_threads_query(q)
    elif command.command == "tq_del" and q:
        await ctx.db.del_threads_query(q)
    qs = await ctx.db.threads_queries()
    await m.answer("<b>Запросы для Threads:</b>\n" +
                   ("\n".join(f"• <code>{html.escape(x)}</code>" for x in qs) or "пусто"))


def build_dispatcher() -> Dispatcher:
    dp = Dispatcher()
    dp.include_router(router)
    return dp
