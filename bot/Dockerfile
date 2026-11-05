# Telegram Bot для FieldWorker
FROM python:3.11-slim

WORKDIR /app

# Ставим lock: все транзитивные версии закреплены и сверяются по хешам
COPY requirements.txt requirements.lock ./
RUN pip install --no-cache-dir --require-hashes -r requirements.lock

# Копируем код
COPY . .

# Запуск бота
CMD ["python", "bot.py"]
