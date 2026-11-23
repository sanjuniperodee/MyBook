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

## Сессия и обращения без Mac

Сессия Claude живёт на сервере сама и не зависит от Mac. Её открывают из приложения Claude (Code → список сессий,
значок компьютера с зелёной точкой «MyBooks · обращения») или с телефона — это Remote Control: процесс `claude`
работает на сервере, приложение только показывает чат.

- **pm2 `mybook-claude`** — `scripts/support/claude-session.sh`: держит в tmux `mybook-claude` сессию
  `claude --remote-control` в `~/mybook-dev` (без вопросов о правах). Вышла или упала — поднимает тот же разговор по id
  из `~/.mybook-claude-session-id` (удалить файл — начать новый разговор с вводным заданием). pm2 поднимается при
  загрузке сервера (`pm2-srv.service`, список — `pm2 save`).
- **pm2 `mybook-support-dispatch`** — `scripts/support/dispatch.sh`: раз в минуту смотрит новые обращения и пишет в
  сессию «Новое обращение №N…». Последний переданный номер — `~/.mybook-support-last`. Сессии нет — ждёт, номер не
  двигает. Поэтому сама сессия `watch.sh` не запускает.
- Посмотреть сессию в терминале: `tmux attach -t mybook-claude` (выйти, не останавливая: Ctrl-b d). Логи —
  `pm2 logs mybook-claude`, `pm2 logs mybook-support-dispatch`.
- Вход: Remote Control работает только со входом claude.ai (`claude auth login`, ссылку открыть в браузере, код
  вставить). Вход истёк — сторож пишет в лог «нужен вход» и ждёт; войти снова — сессия поднимется сама.
- **Чаты-помощники** — `scripts/support/chat.sh`: крупную работу главная сессия отдаёт отдельным чатам по зонам
  («Вёрстка книги», «Обложка», «CRM»…). Это фоновые сессии Claude с Remote Control — их видно в приложении («Помощник
  · …»), у каждой свой контекст. `ask "<зона>" "<задание>"`: чат зоны открыт — писать ему SendMessage; закрыт —
  продолжить тот же разговор; нет — новый. Итог помощник присылает главной SendMessage. Открыто не больше двух.
  Сообщения между сессиями принимаются без подтверждения (`crossSessionInbound: accept` в `~/.claude/settings.json`).
- Уборка (сторож, раз в час): вложения обращений в `/tmp/mybooks-support` старше 3 дней, логи выкаток старше 30,
  разговоры старше 30 дней (кроме текущего), рабочие копии субагентов без правок старше 2 дней. Раз в неделю (ночь на
  понедельник по Алматы, если сессия свободна) — новый разговор: всё нужное в базе обращений и в памяти.
- Итог выкаток — владельцу в WhatsApp, как в README.

## Первая настройка (уже сделана)

- `git clone` в `~/mybook-dev`, `npm ci`; память Claude — `~/.claude/projects/-home-srv-mybook-dev/memory/`.
- Пуш в GitHub — ключ развёртывания с правом записи `~/.ssh/github_mybook` (в GitHub: Settings → Deploy keys,
  «mybook-server»), remote `git@github-mybook:sanjuniperodee/MyBook.git` (алиас в `~/.ssh/config`).
- Claude Code — `~/.local/bin/claude` (ставится скриптом с claude.ai, обновляется сам).
- pm2: `pm2 start scripts/support/claude-session.sh --name mybook-claude --interpreter bash` и
  `pm2 start scripts/support/dispatch.sh --name mybook-support-dispatch --interpreter bash` из `~/mybook-dev`, `pm2 save`.
