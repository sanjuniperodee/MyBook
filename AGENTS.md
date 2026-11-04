<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Микросервисный рефакторинг (ветка `refactor/microservices`)

Перед любой работой по выносу бэкенда и разделению на сервисы прочитай:

1. `docs/microservices/HANDOFF.md` — как подхватить, ограничения, следующий шаг.
2. `docs/microservices/PROGRESS.md` — текущая задача, статус, блокеры.
3. `docs/microservices/02-target-architecture.md` и `03-migration-plan.md` — куда идём.

Правила: не менять UI без явного запроса; не выкатывать в прод без явного «да»; не начинать волну 1
до гейта G0; новые инфраструктурные технологии — только через ADR; обновлять `PROGRESS.md` после
каждой задачи.
