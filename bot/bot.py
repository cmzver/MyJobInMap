"""
Telegram-бот диспетчер заявок для FieldWorker.

Бот читает сообщения в групповом чате и отправляет их на сервер для парсинга
и создания заявок. Вся логика парсинга находится на сервере.
"""

import os
import logging
import threading

import requests
from dotenv import load_dotenv
from telegram import Update
from telegram.ext import (
    ApplicationBuilder,
    ContextTypes,
    MessageHandler,
    CommandHandler,
    filters,
)

# Загружаем переменные окружения из .env
load_dotenv()

# ============== КОНФИГУРАЦИЯ ==============
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "YOUR_BOT_TOKEN_HERE")
API_BASE_URL = os.getenv("API_BASE_URL", "http://127.0.0.1:8001")
API_TOKEN = os.getenv("API_TOKEN", "")
API_USERNAME = os.getenv("API_USERNAME", "")
API_PASSWORD = os.getenv("API_PASSWORD", "")
API_TOKEN_LOCK = threading.Lock()
# Минимальная длина сообщения для обработки
MIN_MESSAGE_LENGTH = int(os.getenv("MIN_MESSAGE_LENGTH", "20"))
# ==========================================

# Настройка логирования
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO
)
logger = logging.getLogger(__name__)


def _login_for_token() -> str:
    if not API_USERNAME or not API_PASSWORD:
        return ""

    try:
        response = requests.post(
            f"{API_BASE_URL}/api/auth/login",
            data={"username": API_USERNAME, "password": API_PASSWORD},
            timeout=10,
        )
        response.raise_for_status()
        data = response.json()
        token = data.get("access_token", "")
        if not token:
            logger.error("API login succeeded but access_token is missing in response")
            return ""
        return token
    except requests.exceptions.RequestException as exc:
        logger.error(f"API login failed: {exc}")
        return ""


def get_api_token(force_refresh: bool = False) -> str:
    global API_TOKEN
    if API_TOKEN and not force_refresh:
        return API_TOKEN
    if not API_USERNAME or not API_PASSWORD:
        return ""
    with API_TOKEN_LOCK:
        if API_TOKEN and not force_refresh:
            return API_TOKEN
        token = _login_for_token()
        if token:
            API_TOKEN = token
        return API_TOKEN


def get_api_headers(force_refresh: bool = False) -> dict | None:
    token = get_api_token(force_refresh=force_refresh)
    if not token:
        return None
    return {"Authorization": f"Bearer {token}"}


def is_potential_task(text: str) -> bool:
    """
    Быстрая проверка, похоже ли сообщение на заявку.
    Не парсит — только проверяет наличие ключевых признаков.
    """
    if len(text) < MIN_MESSAGE_LENGTH:
        return False
    
    text_lower = text.lower()
    
    # Признаки заявки диспетчерской
    if text.strip().startswith("№"):
        return True
    
    # Ключевые слова
    keywords = ["заявка", "#заявка", "адрес:", "клиент:"]
    if any(kw in text_lower for kw in keywords):
        return True
    
    # Признаки адреса
    address_markers = ["ул.", "пр.", "д.", "корп.", "подъезд", "кв."]
    if sum(1 for m in address_markers if m in text_lower) >= 2:
        return True
    
    return False


def send_to_server(text: str, sender: str) -> dict:
    """
    Отправляет текст на сервер для парсинга и создания заявки.
    
    Returns:
        Словарь с ответом сервера или информацией об ошибке.
    """
    url = f"{API_BASE_URL}/api/tasks/from-text"
    
    payload = {
        "text": text,
        "source": "telegram",
        "sender": sender
    }
    
    try:
        headers = get_api_headers()
        if not headers:
            logger.error("API token is not configured for bot and API credentials are missing")
            return {"success": False, "error": "API token is not configured"}
        response = requests.post(url, json=payload, headers=headers, timeout=15)
        if response.status_code == 401:
            headers = get_api_headers(force_refresh=True)
            if not headers:
                logger.error("API token refresh failed")
                return {"success": False, "error": "API token is not configured"}
            response = requests.post(url, json=payload, headers=headers, timeout=15)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.ConnectionError:
        logger.error(f"Не удалось подключиться к серверу: {url}")
        return {"success": False, "error": "Сервер недоступен"}
    except requests.exceptions.Timeout:
        logger.error("Таймаут при отправке заявки")
        return {"success": False, "error": "Таймаут сервера"}
    except requests.exceptions.HTTPError as e:
        logger.error(f"HTTP ошибка: {e}")
        try:
            error_data = response.json()
            return {"success": False, "error": error_data.get("detail", f"Ошибка {response.status_code}")}
        except:
            return {"success": False, "error": f"Ошибка {response.status_code}"}
    except Exception as e:
        logger.error(f"Неизвестная ошибка: {e}")
        return {"success": False, "error": str(e)}


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Обработчик входящих сообщений.
    Проверяет похоже ли сообщение на заявку и отправляет на сервер.
    """
    if not update.message or not update.message.text:
        return
    
    text = update.message.text
    user = update.message.from_user
    chat = update.message.chat
    
    # Быстрая проверка — похоже ли на заявку
    if not is_potential_task(text):
        return
    
    # Определяем отправителя
    sender = user.username or user.first_name or str(user.id)
    
    logger.info(
        f"📝 Потенциальная заявка от {sender} в чате {chat.title or chat.id}"
    )
    
    # Отправляем на сервер для парсинга и создания
    result = send_to_server(text, sender)
    
    # Формируем ответ
    if result.get("success"):
        task = result.get("task", {})
        task_number = task.get("task_number", "?")
        address = task.get("raw_address", "")
        lat = task.get("lat")
        lon = task.get("lon")
        
        # Показываем распознанные данные
        parsed = result.get("parsed_data", {})
        ext_id = parsed.get("external_id")
        ext_id_info = f" (внеш. №{ext_id})" if ext_id else ""
        
        if lat and lon and lat != 0 and lon != 0:
            reply = (
                f"✅ Заявка {task_number}{ext_id_info} принята!\n"
                f"📍 Адрес: {address}\n"
                f"🗺 Координаты: {lat:.5f}, {lon:.5f}"
            )
        else:
            reply = (
                f"✅ Заявка {task_number}{ext_id_info} принята!\n"
                f"📍 Адрес: {address}\n"
                f"⚠️ Координаты не определены"
            )
        
        # Добавляем контактную информацию
        phone = parsed.get("contact_phone")
        if phone:
            reply += f"\n📞 {phone}"
    else:
        error = result.get("error", "Неизвестная ошибка")
        # Если не удалось распознать — не отвечаем (возможно это не заявка)
        if "Не удалось распознать" in error:
            logger.info(f"Сообщение не распознано как заявка: {text[:50]}...")
            return
        reply = f"❌ Ошибка: {error}"
    
    # Отвечаем на сообщение
    await update.message.reply_text(reply)


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик команды /start."""
    await update.message.reply_text(
        "👋 Привет! Я бот-диспетчер заявок.\n\n"
        "📝 <b>Поддерживаемые форматы:</b>\n\n"
        "<b>1. Формат диспетчерской:</b>\n"
        "<code>№123456 Текущая. Адрес, подъезд 1. Категория. Описание. кв.45 +79110000000</code>\n\n"
        "<b>2. Свободный формат:</b>\n"
        "<code>Заявка. Клиент: Название. Адрес: Полный адрес. Задача: Описание.</code>\n\n"
        "Я автоматически распознаю заявку и отправлю на сервер.",
        parse_mode="HTML"
    )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик команды /help."""
    await update.message.reply_text(
        "📖 <b>Как создать заявку:</b>\n\n"
        "<b>Формат диспетчерской (автоматический):</b>\n"
        "<code>№1173544 Текущая. Центральная ул., д.3, "
        "Лен. обл. гп. Новоселье, подъезд 1. "
        "Брелки. Не работает брелок. кв.45 +79110000000</code>\n\n"
        "<b>Что распознаётся:</b>\n"
        "• №XXXXXX — номер заявки\n"
        "• Адрес с подъездом\n"
        "• Категория работ\n"
        "• Описание проблемы\n"
        "• Квартира (кв.XX)\n"
        "• Телефон (+7XXXXXXXXXX)\n"
        "• Имя контакта\n\n"
        "<b>Свободный формат:</b>\n"
        "<code>Заявка. Клиент: Магазин. Адрес: Москва, ул. Ленина 1. Задача: Ремонт.</code>\n\n"
        "💡 Парсинг выполняется на сервере.",
        parse_mode="HTML"
    )


async def status_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик команды /status - проверка связи с сервером."""
    try:
        headers = get_api_headers()
        if not headers:
            await update.message.reply_text("❌ API token is not configured for bot")
            return
        response = requests.get(f"{API_BASE_URL}/api/tasks", headers=headers, timeout=5)
        if response.status_code == 401:
            headers = get_api_headers(force_refresh=True)
            if not headers:
                await update.message.reply_text("❌ API token is not configured for bot")
                return
            response = requests.get(f"{API_BASE_URL}/api/tasks", headers=headers, timeout=5)
        if response.ok:
            tasks = response.json()
            new_count = sum(1 for t in tasks if t.get("status") == "NEW")
            in_progress = sum(1 for t in tasks if t.get("status") == "IN_PROGRESS")
            done_count = sum(1 for t in tasks if t.get("status") == "DONE")
            
            await update.message.reply_text(
                f"✅ Сервер доступен ({API_BASE_URL})\n\n"
                f"📊 <b>Статистика заявок:</b>\n"
                f"🔴 Новых: {new_count}\n"
                f"🟠 В работе: {in_progress}\n"
                f"🟢 Выполнено: {done_count}\n"
                f"📋 Всего: {len(tasks)}",
                parse_mode="HTML"
            )
        else:
            await update.message.reply_text(f"⚠️ Сервер вернул ошибку: {response.status_code}")
    except requests.exceptions.ConnectionError:
        await update.message.reply_text(f"❌ Сервер недоступен ({API_BASE_URL})")
    except Exception as e:
        await update.message.reply_text(f"❌ Ошибка: {e}")


def main() -> None:
    """Запуск бота."""
    if TELEGRAM_BOT_TOKEN == "YOUR_BOT_TOKEN_HERE":
        logger.error(
            "❌ Токен бота не настроен!\n"
            "   Создайте файл .env и добавьте:\n"
            "   TELEGRAM_BOT_TOKEN=ваш_токен"
        )
        return
    
    logger.info("🚀 Запуск бота...")
    logger.info(f"📡 API сервер: {API_BASE_URL}")
    
    # Создаём приложение
    application = ApplicationBuilder().token(TELEGRAM_BOT_TOKEN).build()
    
    # Регистрируем обработчики команд
    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CommandHandler("status", status_command))
    
    # Регистрируем обработчик сообщений (текстовые, не команды)
    application.add_handler(
        MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message)
    )
    
    # Запускаем бота
    logger.info("✅ Бот запущен и готов к работе!")
    application.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
