"""Юзербот: слушает все группы/чаты, в которых состоит аккаунт, и отдаёт
сообщения в конвейер. Работает через Telethon (MTProto) от имени обычного аккаунта.
"""
from __future__ import annotations

import logging
import re

from telethon import TelegramClient, events, functions, types
from telethon.errors import FloodWaitError, UserAlreadyParticipantError
from telethon.utils import get_display_name, get_peer_id

from .pipeline import Incoming, Pipeline

log = logging.getLogger(__name__)

_INVITE_RX = re.compile(r"(?:t\.me/\+|t\.me/joinchat/|tg://join\?invite=)([\w-]+)")
_PUBLIC_RX = re.compile(r"(?:https?://)?t\.me/([A-Za-z0-9_]{4,})/?$|^@?([A-Za-z0-9_]{4,})$")


def message_link(chat, msg_id: int) -> str | None:
    username = getattr(chat, "username", None)
    if username:
        return f"https://t.me/{username}/{msg_id}"
    if isinstance(chat, types.Channel):  # приватная супергруппа: ссылка работает только для участников
        return f"https://t.me/c/{chat.id}/{msg_id}"
    return None


class UserBot:
    def __init__(self, api_id: int, api_hash: str, session: str, pipeline: Pipeline):
        self.client = TelegramClient(session, api_id, api_hash)
        self.pipeline = pipeline
        self.me_id: int | None = None
        self.ignore_ids: set[int] = set()  # id нашего бота и т.п.

    async def start(self) -> None:
        await self.client.connect()
        if not await self.client.is_user_authorized():
            raise RuntimeError(
                "Юзербот не авторизован. Сначала запусти:  python login.py"
            )
        me = await self.client.get_me()
        self.me_id = me.id
        log.info("Юзербот запущен как %s (id %s)", get_display_name(me), me.id)
        self.client.add_event_handler(self._on_message, events.NewMessage(incoming=True))

    async def _on_message(self, event: events.NewMessage.Event) -> None:
        if event.is_private:  # личка юзербота нас не интересует
            return
        text = event.raw_text or ""
        if len(text) < 15:
            return
        try:
            chat = await event.get_chat()
            if isinstance(chat, types.Channel) and chat.broadcast:
                return  # каналы (не группы) — там пишут авторы, а не клиенты
            sender = await event.get_sender()
        except Exception:
            log.debug("Не удалось получить чат/автора", exc_info=True)
            return
        if sender is None or getattr(sender, "bot", False):
            return
        if sender.id in self.ignore_ids or sender.id == self.me_id:
            return

        username = getattr(sender, "username", None)
        msg = Incoming(
            source="telegram",
            text=text,
            chat_id=event.chat_id,
            chat=get_display_name(chat),
            author=f"@{username}" if username else get_display_name(sender),
            author_url=f"https://t.me/{username}" if username else f"tg://user?id={sender.id}",
            url=message_link(chat, event.id),
        )
        try:
            await self.pipeline.process(msg)
        except Exception:
            log.exception("Ошибка обработки сообщения")

    # ---------- управление чатами (команды админа) ----------
    async def join(self, link: str) -> tuple[int | None, str, bool]:
        """Вступить в чат. Возвращает (chat_id или None при ошибке, название/ошибка,
        состоял_ли_уже_в_чате)."""
        link = link.strip()
        already = False
        try:
            m = _INVITE_RX.search(link)
            if m:
                try:
                    res = await self.client(functions.messages.ImportChatInviteRequest(m.group(1)))
                    entity = res.chats[0]
                except UserAlreadyParticipantError:
                    already = True
                    info = await self.client(functions.messages.CheckChatInviteRequest(m.group(1)))
                    entity = getattr(info, "chat", None)
                    if entity is None:
                        return None, "Уже состою в этом чате, но не смог его определить", True
            else:
                m = _PUBLIC_RX.search(link)
                if not m:
                    return None, "Не понял ссылку. Пример: @chatname или https://t.me/chatname", False
                entity = await self.client.get_entity(m.group(1) or m.group(2))
                if isinstance(entity, types.User):
                    return None, "Это пользователь, а не чат", False
                if isinstance(entity, types.Channel) and entity.broadcast:
                    return None, "Это канал, а не чат — в каналах заказы не публикуют клиенты", False
                already = isinstance(entity, types.Channel) and not entity.left
                if not already:
                    await self.client(functions.channels.JoinChannelRequest(entity))
            return get_peer_id(entity), get_display_name(entity), already
        except FloodWaitError as e:
            return None, f"Telegram просит подождать {e.seconds} сек. Попробуй позже.", False
        except Exception as e:
            return None, f"Ошибка: {e}", False

    async def leave_by_id(self, chat_id: int) -> None:
        try:
            await self.client.delete_dialog(chat_id)
        except Exception:
            log.warning("Не удалось выйти из чата %s", chat_id, exc_info=True)

    async def list_chats(self) -> list[str]:
        out = []
        async for d in self.client.iter_dialogs():
            e = d.entity
            if d.is_group or (isinstance(e, types.Channel) and not e.broadcast):
                name = d.name
                if getattr(e, "username", None):
                    name += f" (@{e.username})"
                out.append(name)
        return out

    async def stop(self) -> None:
        await self.client.disconnect()
