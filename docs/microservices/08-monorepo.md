# 08. Монорепо: каркас (M0.5)

> Состояние: каркас есть, код **не перенесён**. Это сознательно: M1.1 — отдельный шаг с тестами
> и визуальной сверкой.

## 1. Что сделано

- Корневой `package.json` получил `workspaces: ["apps/*", "packages/*"]`.
- `packages/contracts` — `@mybook/contracts`, пустой `src/index.ts` (наполняется в M1.1).
- `packages/platform-kit` — `@mybook/platform-kit`, заготовка env/logger/OTel.
- `apps/README.md` — будущие `web` и `api`.
- `infra/compose/README.md` — будущий локальный стенд.
- `npm install` создал симлинки `node_modules/@mybook/*`.

Проверки после добавления workspaces: `tsc`, `vitest`, `next build` — зелёные (см. PROGRESS).

## 2. Раскладка

Сейчас:

```
/                     корневое Next-приложение (пока и web, и api)
  src/                страницы, компоненты, модули, server — всё как было
  packages/
    contracts/        @mybook/contracts — типы/DTO
    platform-kit/     @mybook/platform-kit — env/logger/OTel
  apps/               README; здесь появятся web и api
  infra/
    compose/          README; здесь появится локальный стенд
  tests/              тесты корня
```

После M1.1:

```
apps/
  web/                Next.js: страницы, компоненты, actions, BFF
  api/                Next.js API core (переходный): /api/**, модули, миграции
packages/
  contracts/          DTO, ошибки, события, OpenAPI-типы
  core/               modules + shared + server (пока не разъехались по сервисам)
  platform-kit/       env, logger, otel, auth, testing
infra/compose/        postgres, redis, nats, minio, mailpit
```

`packages/core` — временный: по мере выноса сервисов код уезжает в `services/*` или `apps/api`.
Это позволяет не делать «большой перенос» дважды.

## 3. Что куда поедет в M1.1

| Сейчас | Куда | Примечание |
|---|---|---|
| `src/app/api/**` | `apps/api/src/app/api/**` | роуты не переписываем |
| `src/app/**` (кроме api) | `apps/web/src/app/**` | страницы, layouts, actions |
| `src/components/**` | `apps/web/src/components/**` | без изменений |
| `src/modules/**` | `packages/core/modules/**` | потом разъедется по сервисам |
| `src/shared/**` | `packages/core/shared/**` | общее ядро |
| `src/server/**` | `packages/core/server/**` + web-адаптеры | auth/books/access — web; container/scheduler — api |
| `src/lib/book/**`, `pdf/**` | `packages/core/lib/**` | нужно publishing и тестам |
| `src/lib/content/**`, `i18n/**` | `packages/content` или `packages/core` | нужно и web, и api |
| `drizzle/**` | `apps/api/drizzle/**` | миграции у api |
| `public/**`, `assets/fonts` | `apps/web/public`, корневой `assets` | шрифты нужны и PDF, и CSS |
| `tests/**` | по владельцу | architecture/integration остаются в корне |

Правила M1.1: только `git mv`, никаких изменений логики, отдельные PR на перенос и на RPC.

## 4. Почему npm workspaces, а не pnpm/Turborepo

- Прод уже на npm и `package-lock.json`; pnpm — отдельная миграция lockfile и деплоя.
- Turborepo добавим в M1.1, когда появятся `apps/web` и `apps/api` и станет что кэшировать.
  Сейчас это лишняя зависимость и lockfile-шум.
- Корневой пакет остаётся приложением до M1.1; workspaces нужны только для `@mybook/*`.

## 5. Правила пакетов

- `@mybook/contracts` — только типы/DTO/схемы; не импортирует `modules`, `server`,
  `shared/infrastructure`, Next.js, БД.
- `@mybook/platform-kit` — env, логгер, OTel, тестовые утилиты; может импортировать `contracts`,
  но не модули и не БД.
- Пакеты не собираются в отдельные бандлы: `exports` указывает на `src/index.ts`, TypeScript
  резолвит исходники. Сборка/публикация — только если появится внешний потребитель.
- Импорт: `import { ... } from "@mybook/contracts"`. Пути `@/…` остаются внутри приложения.

## 6. Проверка

```sh
npm install
npm ls --workspaces --depth=0
npx tsc --noEmit
npm test
npm run build
```

Ожидаемо: два workspace-пакета, `tsc` 0, тесты зелёные, Next-сборка проходит.

## 7. Откат

Если workspaces ломают Next/tsc:

1. убрать `workspaces` из корневого `package.json`;
2. `npm install` (вернуть lockfile);
3. папки `apps/`/`packages/` оставить как документацию до M1.1.

Код приложения в M0.5 не менялся, поэтому откат безопасен.

## 8. Следующий шаг

M1.1 — перенос кода по таблице выше, первый PR без изменения поведения. До него нужен G0:
подтверждение target A, RAM и деплоя; S3-доступ — отдельный блокер.
