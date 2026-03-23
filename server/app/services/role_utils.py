"""Helpers for public and canonical user role handling."""

from __future__ import annotations

from typing import Any

from app.models.enums import UserRole


def canonical_role_value(role: Any) -> str:
    """Map public role aliases to canonical DB role values."""
    if isinstance(role, UserRole):
        role_value = role.value
    else:
        role_value = str(role or UserRole.WORKER.value).strip().lower()

    if role_value == UserRole.SUPERADMIN.value:
        return UserRole.ADMIN.value
    if role_value == UserRole.MANAGER.value:
        return UserRole.DISPATCHER.value
    return role_value


def public_role_value(role: Any, organization_id: int | None = None) -> str:
    """Expose public role value in API while keeping input aliases supported."""
    canonical = canonical_role_value(role)

    if canonical == UserRole.ADMIN.value and organization_id is None:
        return UserRole.SUPERADMIN.value
    return canonical


def is_admin_user(user: Any) -> bool:
    return canonical_role_value(getattr(user, "role", None)) == UserRole.ADMIN.value


def is_superadmin_user(user: Any) -> bool:
    return is_admin_user(user) and getattr(user, "organization_id", None) is None


def is_dispatcher_or_admin_user(user: Any) -> bool:
    return canonical_role_value(getattr(user, "role", None)) in {
        UserRole.ADMIN.value,
        UserRole.DISPATCHER.value,
    }
