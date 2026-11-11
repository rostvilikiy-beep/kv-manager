"""Один раз авторизовать юзербот: спросит номер телефона и код из Telegram.
После этого рядом появится файл <TG_SESSION>.session — не отдавай его никому,
это полный доступ к аккаунту."""
from telethon.sync import TelegramClient

from leadbot import config

cfg = config.load()
if not (cfg.tg_api_id and cfg.tg_api_hash):
    raise SystemExit("Заполни TG_API_ID и TG_API_HASH в .env")

with TelegramClient(cfg.tg_session, cfg.tg_api_id, cfg.tg_api_hash) as client:
    me = client.get_me()
    print(f"Готово! Юзербот авторизован как {me.first_name} (@{me.username}).")
