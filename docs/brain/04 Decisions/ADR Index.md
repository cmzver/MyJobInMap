# ADR Index

Здесь хранится индекс архитектурных решений. Каждое решение оформляйте отдельной заметкой из шаблона.

## Принятые / предложенные

- [[ADR-0001 Background task queue (ARQ)]] — Accepted — фоновая очередь ARQ+Redis с inline-fallback.
- [[ADR-0002 Migration to PostgreSQL]] — Accepted — прод на PostgreSQL, SQLite для тестов.
- [[ADR-0003 Geocoding via DaData first]] — Accepted — точка дома из DaData, OSM — запасной.
- [[ADR-0004 Worker access rules]] — Accepted — карточка объекта, ссылка на статус, события.
- [[ADR-0005 Prod network exposure]] — Accepted — БД и API только на 127.0.0.1.
- [[ADR-0006 Portal themes are intentional]] — Accepted — альтернативные темы не удалять.

## Текущие решения для фиксации

- state machine статусов заявок
- multi-tenant изоляция данных
- `basename=/portal` для веб-портала
- offline-first подход Android клиента

## Шаблон

- [[Templates/ADR Template]]