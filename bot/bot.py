"""
Telegram-бот диспетчер заявок для FieldWorker.

Бот читает сообщения в групповом чате и отправляет их на сервер для парсинга
и создания заявок. Вся логика парсинга находится на сервере.

Поддержка автоназначения: бот в группе "заявки Иванов" автоматически
назначает заявки пользователю ivanov. Маппинг задаётся через
переменную окружения GROUP_WORKER_MAP (JSON).
"""

import asyncio
import json
import logging
import os
import re
import threading
import time

import requests
from dotenv import load_dotenv
from telegram import Update
from telegram.error import Conflict
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

# Маппинг "подстрока названия группы" → "username работника"
# Загружается из серверного API, с фолбэком на env-переменную GROUP_WORKER_MAP
_group_worker_raw = os.getenv("GROUP_WORKER_MAP", "")
_ENV_GROUP_WORKER_MAP: dict[str, str] = {}
if _group_worker_raw:
    try:
        _ENV_GROUP_WORKER_MAP = {
            k.lower().strip(): v.strip()
            for k, v in json.loads(_group_worker_raw).items()
        }
    except (json.JSONDecodeError, AttributeError) as exc:
        logging.warning(f"GROUP_WORKER_MAP — невалидный JSON, маппинг пуст: {exc}")

# Кэш маппинга, загруженного с сервера
_CACHED_BOT_SETTINGS: dict = {}
_CACHE_TIMESTAMP: float = 0.0
CACHE_TTL_SECONDS = int(os.getenv("BOT_CACHE_TTL", "300"))  # 5 минут
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


def _api_request(method: str, path: str, **kwargs) -> requests.Response | None:
    """
    Запрос к API с авторизацией и одной повторной попыткой при 401
    (токен мог истечь — обновляем и повторяем).

    Returns:
        requests.Response, либо None если учётные данные не настроены.
        Сетевые исключения requests пробрасываются — обрабатывает вызывающий.
    """
    kwargs.setdefault("timeout", 10)
    url = f"{API_BASE_URL}{path}"

    headers = get_api_headers()
    if not headers:
        return None
    resp = requests.request(method, url, headers=headers, **kwargs)
    if resp.status_code == 401:
        headers = get_api_headers(force_refresh=True)
        if not headers:
            return None
        resp = requests.request(method, url, headers=headers, **kwargs)
    return resp


def _fetch_bot_settings() -> dict:
    """
    Загружает настройки бота с сервера (маппинг групп, флаги).
    Кэширует на CACHE_TTL_SECONDS секунд.
    При ошибке возвращает последний кэш или env-фолбэк.
    """
    global _CACHED_BOT_SETTINGS, _CACHE_TIMESTAMP

    now = time.time()
    if _CACHED_BOT_SETTINGS and (now - _CACHE_TIMESTAMP) < CACHE_TTL_SECONDS:
        return _CACHED_BOT_SETTINGS

    try:
        resp = _api_request("GET", "/api/public/telegram-bot/mappings")
        if resp is None:
            raise RuntimeError("No auth headers")
        resp.raise_for_status()
        data = resp.json()
        _CACHED_BOT_SETTINGS = data
        _CACHE_TIMESTAMP = now
        logger.debug(f"Настройки бота обновлены из сервера: {len(data.get('mappings', {}))} маппингов")
        return data
    except Exception as exc:
        logger.warning(f"Не удалось загрузить настройки бота с сервера: {exc}")
        # Если кэш есть — используем
        if _CACHED_BOT_SETTINGS:
            return _CACHED_BOT_SETTINGS
        # Фолбэк на env
        return {"enabled": True, "mappings": _ENV_GROUP_WORKER_MAP, "dedup_enabled": True}


def get_group_worker_map() -> dict[str, str]:
    """Получить текущий маппинг группа → работник (из сервера или env)."""
    settings = _fetch_bot_settings()
    return settings.get("mappings", _ENV_GROUP_WORKER_MAP)


# Кэш уже отправленных групп (chat_id → title), чтобы не слать повторно
_REPORTED_GROUPS: dict[int, str] = {}


def _report_group(chat_id: int, title: str) -> None:
    """
    Сообщить серверу о группе, в которой бот находится.
    Отправляет только если группа новая или название изменилось.
    """
    if _REPORTED_GROUPS.get(chat_id) == title:
        return
    try:
        resp = _api_request(
            "POST",
            "/api/public/telegram-bot/report-group",
            json={"chat_id": chat_id, "title": title},
            timeout=5,
        )
        if resp is not None and resp.ok:
            _REPORTED_GROUPS[chat_id] = title
            logger.debug(f"Группа зарегистрирована: {title} ({chat_id})")
    except Exception as exc:
        logger.debug(f"Не удалось зарегистрировать группу: {exc}")


# Маркеры, с которых начинаются ответы самого бота — такие сообщения игнорируем
_BOT_REPLY_PREFIXES = ("✅", "📝", "❌", "⚠️", "📊", "📖", "👋")


def is_potential_task(text: str) -> bool:
    """
    Быстрая проверка, похоже ли сообщение на заявку.
    Не парсит — только проверяет наличие ключевых признаков.
    """
    if len(text) < MIN_MESSAGE_LENGTH:
        return False

    stripped = text.strip()

    # Игнорируем сообщения, которые выглядят как ответы бота
    if stripped.startswith(_BOT_REPLY_PREFIXES):
        return False
    
    text_lower = text.lower()

    # Внешний номер диспетчерской (№123456) — где угодно в тексте,
    # даже если сообщение начинается с приветствия.
    if re.search(r"№\s*\d{3,}", stripped):
        return True

    # Явные метки заявки. Слово «заявка» — только как отдельное слово,
    # чтобы переписка вроде «по заявкам можем прописать?» не считалась заявкой.
    if (
        re.search(r"\bзаявка\b", text_lower)
        or "#заявка" in text_lower
        or "адрес:" in text_lower
        or "клиент:" in text_lower
    ):
        return True

    # Признаки адреса
    address_markers = ["ул.", "пр.", "д.", "корп.", "подъезд", "кв."]
    if sum(1 for m in address_markers if m in text_lower) >= 2:
        return True

    return False


def resolve_worker_username(chat_title: str | None) -> str | None:
    """
    Определяет username работника по названию Telegram-группы.
    Ищет совпадение ключей маппинга как подстрок в названии чата.
    Маппинг загружается с сервера (с кэшем) или из env.
    """
    if not chat_title:
        return None
    mapping = get_group_worker_map()
    if not mapping:
        return None
    title_lower = chat_title.lower()
    for key, username in mapping.items():
        if key in title_lower:
            return username
    return None


def send_to_server(text: str, sender: str, assigned_username: str | None = None) -> dict:
    """
    Отправляет текст на сервер для парсинга и создания заявки.
    
    Returns:
        Словарь с ответом сервера или информацией об ошибке.
    """
    payload = {
        "text": text,
        "source": "telegram",
        "sender": sender
    }
    if assigned_username:
        payload["assigned_username"] = assigned_username

    response = None
    try:
        response = _api_request(
            "POST", "/api/tasks/from-text", json=payload, timeout=15
        )
        if response is None:
            logger.error("API token is not configured for bot and API credentials are missing")
            return {"success": False, "error": "API token is not configured"}
        response.raise_for_status()
        return response.json()
    except requests.exceptions.ConnectionError:
        logger.error(f"Не удалось подключиться к серверу: {API_BASE_URL}")
        return {"success": False, "error": "Сервер недоступен"}
    except requests.exceptions.Timeout:
        logger.error("Таймаут при отправке заявки")
        return {"success": False, "error": "Таймаут сервера"}
    except requests.exceptions.HTTPError as e:
        logger.error(f"HTTP ошибка: {e}")
        try:
            error_data = response.json()
            return {"success": False, "error": error_data.get("detail", f"Ошибка {response.status_code}")}
        except (ValueError, AttributeError):
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

    # Игнорируем сообщения от самого бота
    if update.message.from_user and update.message.from_user.is_bot:
        return
    
    text = update.message.text
    user = update.message.from_user
    chat = update.message.chat
    
    # Быстрая проверка — похоже ли на заявку
    if not is_potential_task(text):
        return
    
    # Регистрируем группу на сервере (если ещё не отправляли).
    # Блокирующие HTTP-вызовы выносим в поток, чтобы не блокировать event loop.
    if chat.title and chat.id:
        await asyncio.to_thread(_report_group, chat.id, chat.title)

    # Определяем отправителя
    sender = user.username or user.first_name or str(user.id)

    # Определяем работника для автоназначения по названию группы
    assigned_username = await asyncio.to_thread(resolve_worker_username, chat.title)

    logger.info(
        f"📝 Потенциальная заявка от {sender} в чате {chat.title or chat.id}"
        + (f" → назначение: {assigned_username}" if assigned_username else "")
    )

    # Отправляем на сервер для парсинга и создания
    result = await asyncio.to_thread(
        send_to_server, text, sender, assigned_username=assigned_username
    )
    
    # Формируем ответ
    if result.get("success"):
        task = result.get("task", {})
        task_number = task.get("task_number", "?")
        address = task.get("raw_address", "")
        lat = task.get("lat")
        lon = task.get("lon")
        assigned_name = task.get("assigned_user_name")
        
        # Показываем распознанные данные
        parsed = result.get("parsed_data", {})
        ext_id = parsed.get("external_id")
        ext_id_info = f" (внеш. №{ext_id})" if ext_id else ""
        
        # Дополнение существующей заявки или создание новой
        if result.get("updated_existing"):
            reply = f"📝 Заявка {task_number} дополнена комментарием"
        elif lat and lon and lat != 0 and lon != 0:
            reply = (
                f"✅ Заявка {task_number} принята!\n"
                f"📍 Адрес: {address}\n"
                f"🗺 Координаты: {lat:.5f}, {lon:.5f}"
            )
        else:
            reply = (
                f"✅ Заявка {task_number} принята!\n"
                f"📍 Адрес: {address}\n"
                f"⚠️ Координаты не определены"
            )
        
        # Добавляем информацию о назначении
        if assigned_name:
            reply += f"\n👷 Назначена: {assigned_name}"
        
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
        response = await asyncio.to_thread(
            _api_request, "GET", "/api/dashboard/stats", timeout=5
        )
        if response is None:
            await update.message.reply_text("❌ API token is not configured for bot")
            return
        if response.ok:
            stats = response.json()
            
            await update.message.reply_text(
                f"✅ Сервер доступен ({API_BASE_URL})\n\n"
                f"📊 <b>Статистика заявок:</b>\n"
                f"🔴 Новых: {stats.get('newTasks', 0)}\n"
                f"🟠 В работе: {stats.get('inProgressTasks', 0)}\n"
                f"🟢 Выполнено: {stats.get('completedTasks', 0)}\n"
                f"📋 Всего: {stats.get('totalTasks', 0)}\n\n"
                f"👷 Работников: {stats.get('totalWorkers', 0)} "
                f"(активных: {stats.get('activeWorkers', 0)})",
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
    
    # Обработчик ошибок
    async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
        if isinstance(context.error, Conflict):
            logger.warning("Conflict: другой экземпляр бота уже работает, пропускаю")
            return
        logger.error(f"Ошибка: {context.error}")
    
    application.add_error_handler(error_handler)
    
    # Запускаем бота (обрабатываем накопившиеся сообщения чтобы не потерять заявки)
    logger.info("✅ Бот запущен и готов к работе!")
    application.run_polling(
        allowed_updates=Update.ALL_TYPES,
    )


if __name__ == "__main__":
    main()
