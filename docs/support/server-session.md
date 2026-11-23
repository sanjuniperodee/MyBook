# Сессия Claude на сервере

Claude Code работает прямо на прод-сервере `srv@185.102.75.191` — разбирает обращения, правит код и данные и выкатывает
без GitHub Actions. Порядок работы с обращениями тот же — `docs/support/README.md`.

## Где что

- `~/mybook-dev` — **рабочая копия** сессии: здесь правится код, идут проверки и коммиты.
- `~/mybook` — копия, из которой собирается и работает сайт (`deploy/deploy.sh`), с `.env` прода. **Код здесь не
  править**: выкатка делает в ней `git pull` и собирает то, что лежит в папке. Разовые скрипты с доступом к базе и
  файлам (`container()` — пересборка печатных файлов, закрытие обращения) — класть в `~/mybook/scripts/zz-….ts`,
  запускать там же и удалять:
  `SCHEDULER=off PDF_WORKER=off node_modules/.bin/tsx --env-file-if-exists=.env --import ./scripts/preload.mjs scripts/zz-….ts`.
- База — `cd ~/mybook && set -a && . ./.env && set +a && psql "$DATABASE_URL"`. Перед правкой данных — бэкап строк в
  `~/mybook-backups/` (`\copy (...) to '...csv' csv header`).
- Файлы заказов — `~/mybook-storage/orders/<id заказа>/` (block.pdf, cover.pdf, spec.txt), остальное — в бакете
  (`rclone … ps:sigma-centaurus/mybooks/`).
- Обращения — `bash scripts/support/ticket.sh …` и `watch.sh` работают на сервере напрямую, без SSH.

## Выкатка без CI

```bash
bash scripts/support/ship.sh          # проверки по изменённому → пуш в master с [skip ci] → сборка и выкатка здесь
bash scripts/support/ship.sh --full   # с полным набором тестов (крупные изменения)
```

Проверки и сборка идут с низким приоритетом и потолком памяти — сайт рядом отвечает. Выкатка — `deploy/deploy.sh`:
smoke-тест на временном порту, переключение релиза, откат при сбое; после неё обращения из коммитов
(«Обращение №N») закрываются и автору уходит WhatsApp. Лог — `~/mybook-ship-logs/`. Сборка на сервере идёт
дольше, чем в CI (одно ядро): ~10–20 минут — запускать фоном и ждать.

## Слежение

`bash scripts/support/watch.sh <последний №>` фоном; сессия держится в открытом чате приложения Claude (подключение
SSH к серверу). Итог выкаток — владельцу в WhatsApp, как в README.

## Первая настройка (уже сделана)

- `git clone` в `~/mybook-dev`, `npm ci`; память Claude — `~/.claude/projects/-home-srv-mybook-dev/memory/`.
- Пуш в GitHub — ключ развёртывания с правом записи `~/.ssh/github_mybook` (в GitHub: Settings → Deploy keys,
  «mybook-server»), remote `git@github-mybook:sanjuniperodee/MyBook.git` (алиас в `~/.ssh/config`).
- В приложении Claude: «Новая сессия» → SSH → `srv@185.102.75.191`, ключ `~/.ssh/id_ed25519`, папка `~/mybook-dev`.
