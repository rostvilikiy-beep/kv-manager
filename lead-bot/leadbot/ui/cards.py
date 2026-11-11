"""Карточка заказа и кнопки под ней: контакты, сохранить, отклик. Лента и сохранённые."""
from __future__ import annotations

import html
import json

from aiogram import Bot, F, Router
from aiogram.types import CallbackQuery

from ..classifier import Verdict
from ..db import User
from ..filters import CATEGORIES, extract_contacts, mask_contacts
from .common import BACK_MAIN, KB, B, ctx, fmt_ts, get_user, is_pro, show

router = Router()

SOURCE_NAMES = {"telegram": "Telegram-чат", "threads": "Threads"}


def _category(lead: dict, match: dict) -> str | None:
    v = Verdict.from_dict(lead.get("ai"))
    if v and v.category in CATEGORIES:
        return v.category
    cats = (match or {}).get("categories") or []
    return cats[0] if cats else None


def _cat_parts(cat_id: str | None) -> tuple[str, str]:
    """('🌐', 'Сайты и веб-разработка')"""
    if not cat_id:
        return "🔎", "По ключевому слову"
    emoji, _, name = CATEGORIES[cat_id][0].partition(" ")
    return emoji, name


def card_title(lead: dict, match: dict | None = None) -> str:
    v = Verdict.from_dict(lead.get("ai"))
    emoji, name = _cat_parts(_category(lead, match or {}))
    title = v.title if v and v.title else f"Новый заказ: {name.lower()}"
    return f"{emoji} {title}"


def render_card(u: User, lead: dict, match: dict) -> tuple[str, object]:
    v = Verdict.from_dict(lead.get("ai"))
    cat_id = _category(lead, match)
    _, cat_name = _cat_parts(cat_id)

    lines = [f"<b>{html.escape(card_title(lead, match))}</b>", ""]
    if v and v.experience:
        lines += [f"💼 {html.escape(v.experience)}", ""]

    masked = mask_contacts(lead["text"])
    if u.card_style == "full" or not (v and v.summary):
        body = masked if len(masked) <= 1500 else masked[:1500] + "…"
        lines.append(f"<blockquote>{html.escape(body)}</blockquote>")
    else:
        lines.append(html.escape(v.summary))
    if v and v.budget:
        lines.append(f"💰 Бюджет: {html.escape(v.budget)}")
    if v and v.deadline:
        lines.append(f"⏰ Срок: {html.escape(v.deadline)}")

    source = SOURCE_NAMES.get(lead["source"], lead["source"])
    lines += [
        "",
        f"<b>Опубликовано:</b> <i>{fmt_ts(lead['ts'])}</i>",
        f"<b>Источник:</b> {source}",
        f"<b>Сфера:</b> {html.escape(cat_name)}",
    ]
    if (match or {}).get("keyword"):
        lines.append(f"<b>Слово:</b> <code>{html.escape(match['keyword'].rstrip('$'))}</code>")

    pro = is_pro(u)
    if not pro:
        lines += ["", f"<i>На бесплатном тарифе заказы приходят на "
                      f"{ctx.cfg.free_delay_hours:g} ч позже — чтобы те, кто оформил подписку, "
                      "успели первыми. С подпиской заказ будет у тебя через секунду после "
                      "публикации.</i>"]
    return "\n".join(lines), card_kb(u, lead)


def card_kb(u: User, lead: dict, saved: bool = False):
    lid = lead["id"]
    if is_pro(u):
        contacts = "Открыть контакты 🔑"
    else:
        used = ctx.db.contacts_used_today(u)
        contacts = f"[{used}/{ctx.cfg.free_contacts_per_day}] Открыть контакты 🔑"
    rows = [[B(contacts, f"k:{lid}")]]
    if lead.get("url"):
        rows.append([B("Открыть заказ 🔍", url=lead["url"])])
    rows.append([B("✅ Сохранено" if saved else "⭐ Сохранить", f"s:{lid}"),
                 B("✍️ Отклик", f"r:{lid}")])
    rows.append([B("Обновить сферы 🔄", "m:cats!")])
    return KB(*rows)


def make_sender(bot: Bot):
    async def send(u: User, lead: dict, match: dict) -> None:
        text, kb = render_card(u, lead, match)
        await bot.send_message(u.id, text, reply_markup=kb, disable_web_page_preview=True)
    return send


async def _lead_for(c: CallbackQuery) -> tuple[User, dict, dict] | None:
    u = await get_user(c)
    if not u:
        return None
    lead_id = int(c.data.split(":")[1])
    d = await ctx.db.delivery(u.id, lead_id)
    lead = await ctx.db.get_lead(lead_id)
    if not d or not lead:
        await c.answer("Заказ не найден", show_alert=True)
        return None
    return u, lead, d


# ---------------- контакты ----------------
@router.callback_query(F.data.startswith("k:"))
async def cb_contacts(c: CallbackQuery) -> None:
    got = await _lead_for(c)
    if not got:
        return
    u, lead, d = got
    if not d["contacts"] and not is_pro(u):
        used = await ctx.db.use_contact(u.id, ctx.cfg.free_contacts_per_day)
        if used is None:
            await c.answer(f"Лимит {ctx.cfg.free_contacts_per_day} открытий в сутки исчерпан. "
                           "В Pro — без ограничений.", show_alert=True)
            await c.message.answer("⚡ Оформи Pro, чтобы открывать контакты без лимита "
                                   "и получать заказы мгновенно.",
                                   reply_markup=KB([B("⚡ Открыть полный доступ", "m:profile!")]))
            return
    await ctx.db.set_delivery(u.id, lead["id"], contacts=1)

    lines = [f"🔑 <b>Контакты</b> — {html.escape(card_title(lead))}", ""]
    if lead.get("author"):
        author = html.escape(lead["author"])
        url = lead.get("author_url")
        lines.append(f"👤 Автор: <a href=\"{html.escape(url)}\">{author}</a>" if url else
                     f"👤 Автор: {author}")
    if lead.get("chat") and lead["source"] == "telegram":
        lines.append(f"💬 Чат: {html.escape(lead['chat'])}")
    found = extract_contacts(lead["text"])
    if found:
        lines.append("📇 Из текста: " + ", ".join(f"<code>{html.escape(x)}</code>" for x in found))
    if lead.get("url"):
        lines.append(f"🔗 <a href=\"{html.escape(lead['url'])}\">Оригинал сообщения</a>")
    lines += ["", f"<blockquote expandable>{html.escape(lead['text'][:3000])}</blockquote>"]
    await c.message.answer("\n".join(lines), disable_web_page_preview=True)

    u = await ctx.db.get_user(u.id)  # обновить счётчик на кнопке
    try:
        await c.message.edit_reply_markup(reply_markup=card_kb(u, lead, bool(d["saved"])))
    except Exception:
        pass
    await c.answer()


# ---------------- сохранить ----------------
@router.callback_query(F.data.startswith("s:"))
async def cb_save(c: CallbackQuery) -> None:
    got = await _lead_for(c)
    if not got:
        return
    u, lead, d = got
    saved = not d["saved"]
    await ctx.db.set_delivery(u.id, lead["id"], saved=int(saved))
    try:
        await c.message.edit_reply_markup(reply_markup=card_kb(u, lead, saved))
    except Exception:
        pass
    await c.answer("⭐ Сохранено" if saved else "Убрано из сохранённых")


# ---------------- отклик от ИИ ----------------
@router.callback_query(F.data.startswith("r:"))
async def cb_reply(c: CallbackQuery) -> None:
    got = await _lead_for(c)
    if not got:
        return
    u, lead, _ = got
    if not is_pro(u):
        await c.answer("✍️ Генерация откликов доступна в Pro", show_alert=True)
        return
    if not ctx.classifier:
        await c.answer("ИИ не настроен администратором", show_alert=True)
        return
    await c.answer("Пишу отклик…")
    text = await ctx.classifier.write_reply(lead["text"], u.reply_prompt, lead.get("lang") or "ru")
    if not text:
        await c.message.answer("Не получилось сгенерировать отклик, попробуй ещё раз.")
        return
    hint = "" if u.reply_prompt else \
        "\n\n<i>Совет: заполни «О себе» в ⚙️ Настройки → ✍️ Генерация откликов.</i>"
    await c.message.answer(f"✍️ <b>Черновик отклика</b> (нажми, чтобы скопировать):\n\n"
                           f"<code>{html.escape(text)}</code>{hint}")


# ---------------- лента / сохранённые ----------------
async def show_feed(c: CallbackQuery, saved: bool) -> None:
    u = await get_user(c)
    if not u:
        return
    items = await ctx.db.feed(u.id, saved_only=saved)
    title = "⭐ Сохранённые" if saved else "📰 Лента заказов за 7 дней"
    if not items:
        empty = "Пока ничего не сохранено — жми ⭐ под заказом." if saved else \
            "Пока пусто. Как только появятся подходящие заказы — они будут здесь."
        await show(c, f"<b>{title}</b>\n\n{empty}", KB(BACK_MAIN))
        return
    lines, rows = [f"<b>{title}</b>", ""], []
    for i, it in enumerate(items, 1):
        lines.append(f"{i}. {html.escape(card_title(it))} — <i>{fmt_ts(it['ts'], False)}</i>")
    btns = [B(str(i), f"l:{it['id']}") for i, it in enumerate(items, 1)]
    rows = [btns[i:i + 5] for i in range(0, len(btns), 5)]
    rows.append(BACK_MAIN)
    await show(c, "\n".join(lines) + "\n\nНажми номер, чтобы открыть карточку.", KB(*rows))


@router.callback_query(F.data == "m:feed")
async def cb_feed(c: CallbackQuery) -> None:
    await show_feed(c, saved=False)


@router.callback_query(F.data == "m:saved")
async def cb_saved(c: CallbackQuery) -> None:
    await show_feed(c, saved=True)


@router.callback_query(F.data.startswith("l:"))
async def cb_open(c: CallbackQuery) -> None:
    got = await _lead_for(c)
    if not got:
        return
    u, lead, d = got
    text, _ = render_card(u, lead, json.loads(d["match"] or "{}"))
    await c.message.answer(text, reply_markup=card_kb(u, lead, bool(d["saved"])),
                           disable_web_page_preview=True)
    await c.answer()
