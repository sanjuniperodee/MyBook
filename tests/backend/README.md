# tests/backend — тесты, которые поднимают бэкенд на Nest

Поведение API v1 и маршрутов сайта через настоящий бэкенд (`apps/backend`: guard-ы, фильтр ошибок, контроллеры и адаптеры
`legacy/*.ports.ts`) с двойниками `container()` и `@/server/*` (`api.ts`: `nestApi`, `routeWebToApi`, `legacyAuth`).
Перенесены сюда с прежнего `apps/api` на шаге 7 ADR 0014.

Типы этих файлов проверяет `npx tsc --noEmit -p apps/backend` (декораторы Nest), корневой `tsconfig.json` их исключает.
