"""
Разовый запуск периодических заданий без сервера (локально, без Redis)::

    cd server && python -m app.jobs

Пуши уходят как обычно; события WebSocket не рассылаются — подключённые
клиенты увидят уведомления при следующем обновлении.
"""

from app.services.periodic_jobs import run_due_jobs


def main() -> None:
    payloads = run_due_jobs()
    print(f"Уведомлений создано: {len(payloads)}")


if __name__ == "__main__":
    main()
