# apps/api — эталон для тестов (прежний mybook-api удалён 27.11.2026)

С 27.11.2026 весь бэкенд MyBooks — `apps/backend` на NestJS (ADR 0014): API v1 и маршруты сайта, миграции, фон.
Процесс `mybook-api`, его вход, сервер, теневая сверка и сборка `api.mjs` удалены; в прод этот код не попадает.

Здесь остались обработчики (`src/app.ts`, `src/routes`, `src/site-routes.ts`) — только как эталон: на них опираются тесты
поведения в `tests/api-v1*.test.ts`, `tests/foreign-access.test.ts` и др. и тесты паритета `apps/backend/test/*.parity.test.ts`
(Nest ↔ прежний API байт в байт). Прокладка `next/*` переехала в `src/server/http/` (её собирает бэкенд на Nest).

Следующий шаг (ADR 0014, шаг 7): перенести эти тесты на Nest и удалить `apps/api` целиком.
