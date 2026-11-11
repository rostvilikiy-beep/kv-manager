"""Общее для интерфейса: контекст приложения, кнопки, проверка доступа."""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from zoneinfo import ZoneInfo

from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from ..config import Config
from ..db import DB, User

if TYPE_CHECKING:
    from ..classifier import Classifier
    from ..pipeline import Pipeline
    from ..threads_source import ThreadsSource
    from ..userbot import UserBot


class Ctx:
    cfg: Config
    db: DB
    pipeline: "Pipeline"
    classifier: "Classifier | None" = None
    userbot: "UserBot | None" = None
    threads: "ThreadsSource | None" = None
    bot_username: str = ""


ctx = Ctx()


class Edit(StatesGroup):
    keywords = State()
    stopwords = State()
    about = State()
    group = State()


def B(text: str, data: str | None = None, url: str | None = None) -> InlineKeyboardButton:
    return InlineKeyboardButton(text=text, callback_data=data, url=url)


def KB(*rows: list[InlineKeyboardButton]) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[r for r in rows if r])


BACK_MAIN = [B("⬅️ В меню", "m:main")]
BACK_SETTINGS = [B("⬅️ К настройкам", "m:settings")]


def on_off(v: bool) -> str:
    return "✅" if v else "❌"


def is_admin(uid: int) -> bool:
    return uid in ctx.cfg.admin_ids


def is_pro(u: User) -> bool:
    return u.is_pro or is_admin(u.id)


def fmt_ts(ts: int, with_year: bool = True) -> str:
    dt = datetime.fromtimestamp(ts, ZoneInfo(ctx.cfg.tz))
    return dt.strftime("%d.%m.%Y %H:%M" if with_year else "%d.%m %H:%M")


async def get_user(obj: Message | CallbackQuery) -> User | None:
    u = obj.from_user
    if not ctx.cfg.can_use(u.id):
        return None
    user, _ = await ctx.db.ensure_user(u.id, u.username, u.first_name)
    return user


async def show(target: Message | CallbackQuery, text: str, kb: InlineKeyboardMarkup) -> None:
    """Показать экран: из кнопки — редактируем сообщение, из команды — новое.
    Кнопки под карточкой заказа (data оканчивается на «!») не затирают карточку."""
    if isinstance(target, CallbackQuery) and (target.data or "").endswith("!"):
        await target.message.answer(text, reply_markup=kb, disable_web_page_preview=True)
        await target.answer()
    elif isinstance(target, CallbackQuery):
        try:
            await target.message.edit_text(text, reply_markup=kb, disable_web_page_preview=True)
        except Exception:  # «message is not modified» или карточка с другим форматом
            await target.message.answer(text, reply_markup=kb, disable_web_page_preview=True)
        await target.answer()
    else:
        await target.answer(text, reply_markup=kb, disable_web_page_preview=True)
