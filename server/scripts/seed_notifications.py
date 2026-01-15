"""
Seed Notifications
==================
Создаёт тестовые уведомления для демонстрации.
"""

import sys
from pathlib import Path

# Добавляем корневую директорию в путь
sys.path.insert(0, str(Path(__file__).parent.parent))

from datetime import datetime, timedelta, timezone
from app.models import SessionLocal, NotificationModel


def seed_notifications():
    """Создать тестовые уведомления"""
    db = SessionLocal()
    
    try:
        # Очистить существующие уведомления (опционально)
        # db.query(NotificationModel).delete()
        
        # Проверяем, есть ли уже уведомления
        existing = db.query(NotificationModel).count()
        if existing > 0:
            print(f"⚠️  Уже существует {existing} уведомлений. Пропуск...")
            return
        
        # Создаём тестовые уведомления для user_id=1 (admin)
        notifications = [
            NotificationModel(
                user_id=1,
                title="🎉 Добро пожаловать!",
                message="Система уведомлений FieldWorker активна и готова к работе.",
                type="system",
                is_read=False,
                created_at=datetime.now(timezone.utc)
            ),
            NotificationModel(
                user_id=1,
                title="📋 Новая заявка",
                message="Вам назначена заявка №1170773-4 - Трубка",
                type="task",
                task_id=1,
                is_read=False,
                created_at=datetime.now(timezone.utc) - timedelta(hours=2)
            ),
            NotificationModel(
                user_id=1,
                title="⚠️ Срочная заявка",
                message="Аварийная заявка требует немедленного внимания!",
                type="alert",
                task_id=2,
                is_read=False,
                created_at=datetime.now(timezone.utc) - timedelta(hours=5)
            ),
            NotificationModel(
                user_id=1,
                title="✅ Заявка выполнена",
                message="Заявка №1170773-4 успешно завершена",
                type="task",
                task_id=1,
                is_read=True,
                created_at=datetime.now(timezone.utc) - timedelta(days=1)
            ),
            NotificationModel(
                user_id=1,
                title="🔔 Системное обновление",
                message="Доступна новая версия системы FieldWorker v2.0",
                type="system",
                is_read=True,
                created_at=datetime.now(timezone.utc) - timedelta(days=2)
            ),
        ]
        
        # Создаём уведомления для других пользователей (если есть)
        # user_id=2 (рабочий)
        notifications.extend([
            NotificationModel(
                user_id=2,
                title="📋 Новое назначение",
                message="Вам назначена плановая заявка на завтра",
                type="task",
                task_id=3,
                is_read=False,
                created_at=datetime.now(timezone.utc)
            ),
            NotificationModel(
                user_id=2,
                title="🎯 Напоминание",
                message="Не забудьте загрузить фото до и после работ",
                type="system",
                is_read=False,
                created_at=datetime.now(timezone.utc) - timedelta(hours=1)
            ),
        ])
        
        # Добавляем в БД
        for notification in notifications:
            db.add(notification)
        
        db.commit()
        
        print(f"✅ Создано {len(notifications)} тестовых уведомлений")
        print("   - 5 уведомлений для admin (user_id=1)")
        print("   - 2 уведомления для worker (user_id=2)")
        
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    seed_notifications()
