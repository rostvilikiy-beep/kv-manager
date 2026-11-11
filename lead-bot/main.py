"""Запуск: бот-интерфейс + юзербот (Telegram) + опрос Threads + рассылка очереди."""
import asyncio
import logging

from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.types import BotCommand

from leadbot import config, ui
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
    me = await bot.get_me()
    classifier = Classifier(cfg.anthropic_key, cfg.claude_model) if cfg.ai_available else None
    pipeline = Pipeline(db, classifier, ui.make_sender(bot), dedup_hours=cfg.dedup_hours,
                        free_delay_hours=cfg.free_delay_hours, admin_ids=cfg.admin_ids)

    ui.ctx.cfg, ui.ctx.db, ui.ctx.pipeline = cfg, db, pipeline
    ui.ctx.classifier, ui.ctx.bot_username = classifier, me.username
    for admin in cfg.admin_ids:
        await db.ensure_user(admin)

    tasks = [asyncio.create_task(pipeline.run_sender())]
    if cfg.tg_api_id and cfg.tg_api_hash:
        userbot = UserBot(cfg.tg_api_id, cfg.tg_api_hash, cfg.tg_session, pipeline)
        await userbot.start()
        userbot.ignore_ids.add(me.id)
        ui.ctx.userbot = userbot
        tasks.append(asyncio.create_task(userbot.client.run_until_disconnected()))
    else:
        log.warning("TG_API_ID/TG_API_HASH не заданы — Telegram-чаты не слушаем")

    if cfg.threads_available:
        threads = ThreadsSource(cfg.threads_token, db, pipeline, cfg.threads_poll_minutes)
        ui.ctx.threads = threads
        tasks.append(asyncio.create_task(threads.run_forever()))

    log.info("ИИ: %s", cfg.claude_model if classifier else "выключен (нет ANTHROPIC_API_KEY)")
    await bot.set_my_commands([BotCommand(command="menu", description="Главное меню")])
    try:
        await ui.build_dispatcher().start_polling(bot)
    finally:
        for t in tasks:
            t.cancel()
        if ui.ctx.userbot:
            await ui.ctx.userbot.stop()
        await db.close()


if __name__ == "__main__":
    asyncio.run(main())
