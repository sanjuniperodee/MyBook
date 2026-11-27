# apps

| Приложение | Что |
|---|---|
| `apps/backend` | весь бэкенд MyBooks на NestJS + Fastify (ADR 0014): API v1 и маршруты сайта, миграции при старте, фон (`mybook-worker`). Процесс `mybook-backend`, `127.0.0.1:3046`. |

Прежний `apps/api` (mybook-api) удалён: процесс — 27.11.2026, код и эталонные тесты — на шаге 7 ADR 0014 (тесты
перенесены на Nest, ответы прежнего API записаны снимками в `apps/backend/test/__snapshots__`). Веб — отдельный
репозиторий mybook-web (ADR 0013).
