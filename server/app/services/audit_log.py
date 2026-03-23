"""
Audit Log Service
=================
Логирование административных действий для безопасности и трассировки.
"""

import logging
from typing import Optional

logger = logging.getLogger("audit")


def audit_log(
    action: str,
    user_id: int,
    username: str,
    detail: str = "",
    target_type: Optional[str] = None,
    target_id: Optional[int] = None,
    ip_address: Optional[str] = None,
):
    """
    Записать административное действие в аудит-лог.

    Args:
        action: Тип действия (user_create, user_delete, backup_restore и т.д.)
        user_id: ID пользователя, выполнившего действие
        username: Имя пользователя
        detail: Дополнительные детали
        target_type: Тип объекта (user, task, backup)
        target_id: ID объекта
        ip_address: IP-адрес клиента
    """
    parts = [
        f"ACTION={action}",
        f"user={username}(id={user_id})",
    ]
    if target_type:
        parts.append(f"target={target_type}")
    if target_id is not None:
        parts.append(f"target_id={target_id}")
    if ip_address:
        parts.append(f"ip={ip_address}")
    if detail:
        parts.append(f"detail={detail}")

    logger.info(" | ".join(parts))


# Convenience helpers
def audit_user_created(
    admin_id: int, admin_name: str, new_user_id: int, new_username: str, ip: str = None
):
    audit_log(
        "user_create",
        admin_id,
        admin_name,
        f"Created user '{new_username}'",
        "user",
        new_user_id,
        ip,
    )


def audit_user_updated(
    admin_id: int, admin_name: str, target_user_id: int, changes: str, ip: str = None
):
    audit_log("user_update", admin_id, admin_name, changes, "user", target_user_id, ip)


def audit_user_deleted(
    admin_id: int,
    admin_name: str,
    target_user_id: int,
    target_username: str,
    ip: str = None,
):
    audit_log(
        "user_delete",
        admin_id,
        admin_name,
        f"Deleted user '{target_username}'",
        "user",
        target_user_id,
        ip,
    )


def audit_backup_created(admin_id: int, admin_name: str, filename: str, ip: str = None):
    audit_log(
        "backup_create",
        admin_id,
        admin_name,
        f"Created backup '{filename}'",
        "backup",
        ip_address=ip,
    )


def audit_backup_restored(
    admin_id: int, admin_name: str, filename: str, ip: str = None
):
    audit_log(
        "backup_restore",
        admin_id,
        admin_name,
        f"Restored from '{filename}'",
        "backup",
        ip_address=ip,
    )


def audit_backup_deleted(admin_id: int, admin_name: str, filename: str, ip: str = None):
    audit_log(
        "backup_delete",
        admin_id,
        admin_name,
        f"Deleted backup '{filename}'",
        "backup",
        ip_address=ip,
    )


def audit_login_success(user_id: int, username: str, ip: str = None):
    audit_log("login_success", user_id, username, ip_address=ip)


def audit_login_failed(username: str, ip: str = None):
    logger.warning("ACTION=login_failed | user=%s | ip=%s", username, ip or "unknown")
