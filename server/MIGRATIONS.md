"""Alembic: Database Migration Guide

## Инициализация (один раз)

Уже сделано в `alembic/` директории.

## Применение миграций

```bash
cd server
alembic upgrade head
```

## Проверка статуса

```bash
alembic current
alembic history
```

## Откат миграции

```bash
alembic downgrade -1  # Откатить последнюю
alembic downgrade 001_add_planned_date  # Откатить до конкретной
```

## Создание новой миграции

1. Измени модель в `app/models/` (например, добавь новый Column).
2. Запусти:
   ```bash
   alembic revision --autogenerate -m "Описание изменения"
   ```
3. Проверь сгенерированный файл в `alembic/versions/` — убедись, что миграция корректна.
4. Примени:
   ```bash
   alembic upgrade head
   ```

## Типовые миграции

### Добавить столбец
```python
def upgrade() -> None:
    op.add_column("table_name", sa.Column("new_col", sa.String(100), nullable=True))

def downgrade() -> None:
    op.drop_column("table_name", "new_col")
```

### Удалить столбец
```python
def upgrade() -> None:
    op.drop_column("table_name", "col_name")

def downgrade() -> None:
    op.add_column("table_name", sa.Column("col_name", sa.String(100), nullable=True))
```

### Изменить тип столбца
```python
def upgrade() -> None:
    op.alter_column("table_name", "col_name", type_=sa.Text())

def downgrade() -> None:
    op.alter_column("table_name", "col_name", type_=sa.String(100))
```

## Workflow для команды

1. Один разработчик создаёт новую миграцию.
2. Коммитит в систему контроля версий.
3. Остальные применяют миграцию перед пуллом: `alembic upgrade head`.

## Боль-точки

- SQLite не поддерживает многие операции (ALTER для переименования, удаления с constraints).
  Решение: используй `batch_alter_table()` или пересоздание таблицы.
- Автогенерация миграций (`--autogenerate`) не всегда точна. Проверяй вручную!
- Для production используй параллельные миграции или feature flags.

"""
