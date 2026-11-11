"""Профиль, подписка Pro (оплата Telegram Stars), рефералы."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.types import CallbackQuery, LabeledPrice, Message, PreCheckoutQuery

from .common import BACK_MAIN, KB, B, ctx, fmt_ts, get_user, is_admin, is_pro, show

router = Router()


@router.callback_query(F.data.in_({"m:profile", "m:profile!"}))
async def cb_profile(c: CallbackQuery) -> None:
    u = await get_user(c)
    if not u:
        return
    s = await ctx.db.stats(u.id)
    cfg = ctx.cfg
    if u.is_pro:
        plan = f"💎 <b>Pro</b> до {fmt_ts(u.plan_until)}"
    elif is_admin(u.id):
        plan = "💎 <b>Pro</b> (админ)"
    else:
        plan = "🆓 <b>Бесплатный</b>"
    contacts = "без лимита" if is_pro(u) else \
        f"{ctx.db.contacts_used_today(u)}/{cfg.free_contacts_per_day} сегодня"
    text = (
        f"<b>👤 Профиль</b>\n\n"
        f"Тариф: {plan}\n"
        f"Контакты: {contacts}\n"
        f"Заказов: сегодня {s['today']} · за неделю {s['week']} · всего {s['all']}\n"
        + (f"В очереди (придут с задержкой): {s['waiting']}\n" if s["waiting"] else "")
        + "\n<b>⚡ Pro-доступ</b>\n"
        "• заказы через секунду после публикации — ты пишешь клиенту первым\n"
        "• контакты без ограничений\n"
        "• ИИ пишет отклики за тебя\n"
        "• до 20 своих групп для мониторинга\n\n"
        f"Цена: <b>{cfg.pro_price_stars} ⭐</b> за {cfg.pro_days} дней"
    )
    label = "⚡ Продлить Pro" if u.is_pro else "⚡ Открыть полный доступ"
    await show(c, text, KB([B(f"{label} — {cfg.pro_price_stars} ⭐", "buy")],
                           [B("🎁 Получить Pro бесплатно", "m:refs")], BACK_MAIN))


@router.callback_query(F.data == "buy")
async def cb_buy(c: CallbackQuery) -> None:
    if not await get_user(c):
        return
    cfg = ctx.cfg
    await c.message.answer_invoice(
        title=f"Pro-доступ на {cfg.pro_days} дней",
        description="Мгновенные заказы, контакты без лимита, отклики от ИИ.",
        payload=f"pro:{cfg.pro_days}",
        currency="XTR",  # Telegram Stars
        prices=[LabeledPrice(label="Pro", amount=cfg.pro_price_stars)],
    )
    await c.answer()


@router.pre_checkout_query()
async def on_pre_checkout(q: PreCheckoutQuery) -> None:
    ok = q.invoice_payload.startswith("pro:") and q.currency == "XTR"
    await q.answer(ok=ok, error_message=None if ok else "Неизвестный платёж")


@router.message(F.successful_payment)
async def on_paid(m: Message) -> None:
    p = m.successful_payment
    days = int(p.invoice_payload.split(":")[1])
    await ctx.db.ensure_user(m.from_user.id, m.from_user.username, m.from_user.first_name)
    if not await ctx.db.add_payment(p.telegram_payment_charge_id, m.from_user.id,
                                    p.total_amount, days):
        return  # повторное уведомление о том же платеже
    until = await ctx.db.add_pro_days(m.from_user.id, days)
    await ctx.db.make_due_now(m.from_user.id)
    await m.answer(f"🎉 Pro активирован до <b>{fmt_ts(until)}</b>!\n"
                   "Заказы теперь приходят мгновенно. Всё, что ждало в очереди, уже отправляю.",
                   reply_markup=KB(BACK_MAIN))
    await ctx.pipeline.flush()


@router.callback_query(F.data == "m:refs")
async def cb_refs(c: CallbackQuery) -> None:
    u = await get_user(c)
    if not u:
        return
    n = await ctx.db.referrals_count(u.id)
    link = f"https://t.me/{ctx.bot_username}?start=ref_{u.id}"
    days = ctx.cfg.ref_bonus_days
    await show(c, "<b>🎁 Рефералы</b>\n\n"
               f"Приглашай друзей — за каждого нового пользователя получаешь "
               f"<b>+{days} дн. Pro</b>.\n\n"
               f"Твоя ссылка:\n<code>{link}</code>\n\n"
               f"Приглашено: <b>{n}</b>", KB(BACK_MAIN))
