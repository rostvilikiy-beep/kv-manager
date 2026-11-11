"""Запуск: бот-интерфейс + юзербот (Telegram) + опрос Threads в одном процессе."""
import asyncio
import logging

from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode

from leadbot import bot_ui, config
from leadbot.classifier import Classifier
from leadbot.db import DB
from leadbot.pipeline import Pipeline
from leadbot.threads_source import ThreadsSource
from leadbot.userbot import UserBot

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("leadbot")


async def main() -> None:
    cfg = config.load()
    if not cfg.bot_token:
        raise SystemExit("Заполни BOT_TOKEN в .env (см. .env.example)")

    db = DB(cfg.db_path)
    await db.open()

    bot = Bot(cfg.bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    classifier = Classifier(cfg.anthropic_key, cfg.claude_model) if cfg.ai_available else None
    pipeline = Pipeline(db, classifier, bot_ui.make_notifier(bot), cfg.dedup_hours)

    bot_ui.ctx.cfg, bot_ui.ctx.db, bot_ui.ctx.pipeline = cfg, db, pipeline
    for admin in cfg.admin_ids:  # админы сразу получают заказы с настройками по умолчанию
        await db.ensure_user(admin, None)

    tasks = []
    if cfg.tg_api_id and cfg.tg_api_hash:
        userbot = UserBot(cfg.tg_api_id, cfg.tg_api_hash, cfg.tg_session, pipeline)
        await userbot.start()
        userbot.ignore_ids.add((await bot.get_me()).id)
        bot_ui.ctx.userbot = userbot
        tasks.append(asyncio.create_task(userbot.client.run_until_disconnected()))
    else:
        log.warning("TG_API_ID/TG_API_HASH не заданы — Telegram-чаты не слушаем")

    if cfg.threads_available:
        threads = ThreadsSource(cfg.threads_token, db, pipeline, cfg.threads_poll_minutes)
        bot_ui.ctx.threads = threads
        tasks.append(asyncio.create_task(threads.run_forever()))

    log.info("ИИ-фильтр: %s", cfg.claude_model if classifier else "выключен (нет ANTHROPIC_API_KEY)")
    dp = bot_ui.build_dispatcher()
    try:
        await dp.start_polling(bot)
    finally:
        for t in tasks:
            t.cancel()
        if bot_ui.ctx.userbot:
            await bot_ui.ctx.userbot.stop()
        await db.close()


if __name__ == "__main__":
    asyncio.run(main())
