"""Настоящая внешняя транзакция до SAVEPOINT в legacy-режиме SQLite."""

from sqlalchemy.orm import Session


def ensure_transaction(db: Session) -> None:
    connection = db.connection()
    if connection.dialect.name == "sqlite":
        driver = connection.connection.driver_connection
        if not driver.in_transaction:
            connection.exec_driver_sql("BEGIN")
