# mybook-backend — API v1 на NestJS (ADR 0014)

Переезжает с `apps/api` по контекстам. Решение и порядок — `docs/microservices/adr/0014-nestjs-backend.md`.

```bash
npx vitest run apps/backend/test          # e2e через Fastify inject, без БД
npx tsc --noEmit -p apps/backend          # свой tsconfig: декораторы Nest
node scripts/build-backend.mjs            # → .next/standalone/backend.mjs (после next build)
```

## Как перенести контекст

1. `src/modules/<контекст>/{domain,application,infrastructure}` не трогаем: Nest-модуль только собирает фасад или
   сервисы контекста фабрикой провайдера (`modules/feedback/feedback.module.ts`).
2. Зависимости из других контекстов — через порт (интерфейс + символ-токен). Если тот контекст ещё не переехал,
   адаптер кладём в `legacy/` (как `legacy/feedback.ports.ts`), иначе — его Nest-модуль экспортирует порт.
3. Контроллер: `@Endpoint("<имя маршрута контракта>")`, вход — `@Input() input: Parsed<"…">`, ответ — `Output<"…">`.
   Доступ к ресурсу — guard политики контекста, частота — `@RateLimit()`. Обработчик — вызов сервиса и презентер.
4. Отображение, которое пока нужно и `apps/api`, — в `src/modules/<контекст>/ui` (одно на оба процесса).
5. Тест e2e по образцу `test/feedback.e2e.test.ts`: `bootTestApp` + подмена портов.
6. Каждый параметр конструктора — с `@Inject(ТОКЕН)` (esbuild не пишет метаданные типов; проверяет `boundaries.test.ts`).
