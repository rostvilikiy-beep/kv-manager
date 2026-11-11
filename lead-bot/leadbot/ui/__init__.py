from aiogram import Dispatcher

from . import admin, billing, cards, menu
from .cards import make_sender
from .common import ctx

__all__ = ["build_dispatcher", "ctx", "make_sender"]


def build_dispatcher() -> Dispatcher:
    dp = Dispatcher()
    # порядок важен: состояния ввода (группы, слова) — в menu, команды админа — раньше
    dp.include_routers(admin.router, billing.router, cards.router, menu.router)
    return dp
