# apps

Здесь будут приложения после M1.1 (перенос кода, без изменения поведения):

| Приложение | Что | Откуда переезжает |
|---|---|---|
| `apps/web` | Next.js UI + BFF: страницы, компоненты, server actions | `src/app` (кроме `api`), `src/components`, `src/hooks`, `public`, `assets` |
| `apps/api` | бэкенд-ядро: `/api/**`, модули, `shared`, `server`, миграции | `src/app/api`, `src/modules`, `src/shared`, `src/server`, `drizzle` |

Пока здесь только README: в M0.5 код **не переносится**. Правила и порядок переноса —
`docs/microservices/08-monorepo.md`.
