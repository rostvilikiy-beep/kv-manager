"""Админка: общие чаты юзербота, запросы Threads, выдача Pro."""
from __future__ import annotations

import html

from aiogram import F, Router
from aiogram.filters import Command, CommandObject
from aiogram.types import CallbackQuery, Message

from .common import BACK_MAIN, KB, ctx, fmt_ts, is_admin, show

router = Router()

HELP = """<b>👑 Админка</b>

<b>Общие Telegram-чаты</b> (заказы из них получают все):
/join <code>@chat</code> или ссылка — вступить
/leave <code>@chat</code> — выйти
/chats — все чаты юзербота

<b>Threads</b>:
/tq — поисковые запросы, /tq_add <code>нужен сайт</code>, /tq_del <code>…</code>

<b>Пользователи</b>:
/users — статистика
/grant <code>user_id дней</code> — выдать Pro (0 — забрать)

⚠️ Вступай не больше 10–20 чатов в день — иначе Telegram может ограничить аккаунт."""


@router.callback_query(F.data == "m:admin")
async def cb_admin(c: CallbackQuery) -> None:
    if not is_admin(c.from_user.id):
        await c.answer()
        return
    p = ctx.pipeline.stats
    status = [
        f"Юзербот: {'🟢 работает' if ctx.userbot else '🔴 не запущен'}",
        f"Threads: {'🟢 подключён' if ctx.threads else '⚪️ не настроен'}",
        f"ИИ: {'🟢 ' + ctx.cfg.claude_model if ctx.cfg.ai_available else '⚪️ не настроен'}",
        f"С запуска: сообщений {p['seen']}, подошло по словам {p['matched']}, "
        f"отсеяно ИИ {p['ai_rejected']}, доставок {p['queued']}",
    ]
    if ctx.threads and ctx.threads.last_error:
        status.append(f"⚠️ Threads: {html.escape(ctx.threads.last_error[:200])}")
    await show(c, HELP + "\n\n" + "\n".join(status), KB(BACK_MAIN))


@router.message(Command("join"))
async def cmd_join(m: Message, command: CommandObject) -> None:
    if not is_admin(m.from_user.id):
        return
    if not ctx.userbot or not command.args:
        await m.answer("Пример: /join @chatname" if ctx.userbot else "Юзербот не запущен")
        return
    chat_id, info, _ = await ctx.userbot.join(command.args)
    if chat_id is None:
        await m.answer(html.escape(info))
        return
    await ctx.db.add_chat(chat_id, 0, info)
    await m.answer(f"✅ Общий чат: {html.escape(info)}")


@router.message(Command("leave"))
async def cmd_leave(m: Message, command: CommandObject) -> None:
    if not is_admin(m.from_user.id) or not ctx.userbot or not command.args:
        return
    try:
        entity = await ctx.userbot.client.get_entity(command.args.strip())
    except Exception as e:
        await m.answer(f"Не нашёл чат: {html.escape(str(e))}")
        return
    from telethon.utils import get_display_name, get_peer_id
    chat_id = get_peer_id(entity)
    await ctx.db.remove_chat(chat_id, 0)
    if await ctx.db.chat_owner_count(chat_id) == 0:
        await ctx.userbot.leave_by_id(chat_id)
        await m.answer(f"Вышел из {html.escape(get_display_name(entity))}")
    else:
        await m.answer("Убрал из общих. Юзербот остался в чате: его добавили пользователи "
                       "как свою группу.")


@router.message(Command("chats"))
async def cmd_chats(m: Message) -> None:
    if not is_admin(m.from_user.id) or not ctx.userbot:
        return
    chats = await ctx.userbot.list_chats()
    text = "\n".join(f"• {html.escape(c)}" for c in chats) or "Пока ни одного. /join @chat"
    await m.answer(f"<b>Юзербот в {len(chats)} чатах:</b>\n{text}"[:4000])


@router.message(Command("tq", "tq_add", "tq_del"))
async def cmd_tq(m: Message, command: CommandObject) -> None:
    if not is_admin(m.from_user.id):
        return
    q = (command.args or "").strip().lower()
    if command.command == "tq_add" and q:
        await ctx.db.add_threads_query(q)
    elif command.command == "tq_del" and q:
        await ctx.db.del_threads_query(q)
    qs = await ctx.db.threads_queries()
    await m.answer("<b>Запросы для Threads:</b>\n" +
                   ("\n".join(f"• <code>{html.escape(x)}</code>" for x in qs) or "пусто"))


@router.message(Command("users"))
async def cmd_users(m: Message) -> None:
    if is_admin(m.from_user.id):
        total, pro = await ctx.db.users_count()
        await m.answer(f"👥 Пользователей: <b>{total}</b>, из них Pro: <b>{pro}</b>")


@router.message(Command("grant"))
async def cmd_grant(m: Message, command: CommandObject) -> None:
    if not is_admin(m.from_user.id):
        return
    parts = (command.args or "").split()
    if len(parts) != 2 or not all(p.lstrip("-").isdigit() for p in parts):
        await m.answer("Пример: /grant 123456789 30")
        return
    uid, days = int(parts[0]), int(parts[1])
    await ctx.db.ensure_user(uid)
    if days <= 0:
        await ctx.db.update(uid, plan_until=0)
        await m.answer("Pro снят")
        return
    until = await ctx.db.add_pro_days(uid, days)
    await ctx.db.make_due_now(uid)
    await m.answer(f"✅ Pro для {uid} до {fmt_ts(until)}")
    try:
        await m.bot.send_message(uid, f"🎁 Тебе выдан Pro до {fmt_ts(until)}!")
    except Exception:
        pass
