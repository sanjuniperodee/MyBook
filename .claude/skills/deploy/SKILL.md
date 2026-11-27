---
name: deploy
description: Выкатить бэкенд MyBooks (api.mybooks.kz) на прод — пуш в master запускает GitHub Actions, проверка релиза и живого трафика на сервере 185.102.75.191, откат. Использовать, когда просят «задеплой», «выкати на прод», «обнови прод», «откати прод», или спрашивают, что сейчас на проде.
---

# Выкатка бэкенда MyBooks на прод

Навык — про репозиторий **mybook-backend** (API на Nest, воркер, PDF, mybook-files). Сайт и CRM (mybook-web) выкатывает
Vercel по пушу в `main`, приложения (mybook-mobile) — своим CI; здесь их нет.

## Как устроено (с 19.10, сервер с 20.11)

Пуш в `master` → `.github/workflows/deploy.yml`: на GitHub идут типы, линтер, тесты (5 частей), Go, Dart-клиент, сборка
(`npm run build` → `build/`), пакет `mybook-shared` для веба; job «Выкатка» ждёт все и запускает `deploy/ci-run.sh`:
релиз rsync-ом против текущего → код на сервере `git merge --ff-only` → `deploy/deploy.sh --artifact` (smoke на временном
порту → переключение `current` → перезапуск PM2; не ответил — сам откатывается). Вся выкатка ~4 минуты.
Выкатки идут по одной (`concurrency: deploy-prod`). Коммит только с `docs/**`, `**/*.md`, `.claude/**` выкатку не запускает.

**Пуш в `master` — только по явному «да» владельца в этом разговоре** (AGENTS.md).

## Доступ к серверу

```bash
prod() { ssh -i ~/.ssh/id_ed25519 -o BatchMode=yes -o ConnectTimeout=15 srv@185.102.75.191 "$@"; }
```

Функцию объявлять в каждом вызове Bash (состояние оболочки не сохраняется). Пароль не нужен; если ssh просит пароль или
отказывает — остановиться и сказать пользователю, ключи не искать и не генерировать. `srv` без sudo; читать журналы
nginx (`/var/log/nginx/access.log`) — через `ssh -i ~/.ssh/ilmhub/server-key.pem ubuntu@185.102.75.191 'sudo …'`, только чтение.

| Что | Где |
|---|---|
| Код | `~/mybook` (ветка `master`, `.env`, `deploy/*`); сборки на сервере нет |
| Релизы | `~/mybook-releases/releases/<время>-<sha7>` (3 последних), рабочий — симлинк `~/mybook-releases/current` |
| Лог выкатки | `~/mybook-deploy-<sha7>.log`, код выхода — `~/mybook-deploy-<sha7>.log.exit` |
| PM2 MyBooks | `mybook-backend` (:3046, весь API), `mybook-worker` (фон), `mybook-files` (Go, :3050), `mybook-gowa` (WhatsApp) |
| Журналы | `~/.pm2/logs/mybook-<процесс>-{out,error}*.log`, время в строках — UTC |
| Здоровье | `curl -s localhost:3046/api/v1/health`, снаружи `https://api.mybooks.kz/api/v1/health` → `{"ok":true}` |
| Флаги | `~/mybook-flags/site` (старый сайт выключен, сайт на Vercel), `~/mybook-flags/files-service` |
| Бэкапы БД | cron 00:00 и 12:00 (Алматы), `~/bin/daily-backup.sh` → Telegram, копии за 7 суток в `~/db-backups` |
| Уведомление о выкатке | `~/bin/deploy-watch.sh` (cron раз в минуту) → Telegram; `deploy/notify.mjs` → WhatsApp-группа «MyBooks» (если группа есть у номера шлюза) |

Сервер общий (4 ядра, 14 ГБ): рядом `bilimland-api`, `mytest-v2`, `kaspi-pos` (общий с my-test — не перезапускать),
`dosewear*`, ILM HUB в Docker. Трогать только `mybook-*`. Не менять nginx, `.env`, базы без прямой просьбы.

## Порядок

### 1. Что уедет

```bash
git -C mybook-backend fetch -q origin
prod 'basename "$(readlink -f ~/mybook-releases/current)"'      # <время>-<sha7> на проде
git -C mybook-backend log --oneline <sha7-прода>..master
```

Показать пользователю список коммитов. Проверить, что рабочая папка не затрёт чужие правки (`git status`) и `master`
совпадает с `origin/master`; ветку вливать `git merge --ff-only`.

### 2. Проверки до пуша

CI проверит всё сам, но падение там — это 4 минуты впустую. Локально на уезжающем коде:

```bash
npx tsc --noEmit && npx tsc --noEmit -p apps/backend && npx eslint . && npx vitest run && npm run build
```

`npm run build` в конце запускает `smoke-bundles.mjs` (все четыре бандла стартуют). Что-то упало — не пушить, показать ошибку.

### 3. Пуш и ожидание

```bash
gh run list -R sanjuniperodee/MyBook -L 3                 # нет ли идущей выкатки
git -C mybook-backend push origin master
gh run list -R sanjuniperodee/MyBook -L 1                 # id нового запуска
gh run watch <id> -R sanjuniperodee/MyBook --exit-status --interval 30   # в фоне (run_in_background)
```

Упало на проверках — прод не тронут, показать шаг и ошибку (`gh run view <id> --log-failed`). Упало на «Выкатке» —
смотреть лог на сервере: `prod 'tail -60 ~/mybook-deploy-<sha7>.log'`. Повторить выкатку без нового коммита:
`gh workflow run deploy.yml -R sanjuniperodee/MyBook`.

### 4. Проверка после выкатки

```bash
prod 'basename "$(readlink -f ~/mybook-releases/current)"; tail -4 ~/mybook-deploy-<sha7>.log'   # ✓ mybook-backend отвечает
prod 'pm2 jlist' | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{for(const p of JSON.parse(d))if(/^mybook/.test(p.name))console.log(p.name,p.pm2_env.status,"restarts="+p.pm2_env.restart_time,Math.round(p.monit.memory/1048576)+"MB")})'
# mybook-*: online, restarts=0, память: backend ~210–245 МБ, воркер ~185 МБ
curl -s https://api.mybooks.kz/api/v1/health
```

Журналы — **только строки после переключения** (в файлах ошибок лежат и старые записи). Время выкатки — в имени релиза
(`20261127-132329-…` → 13:23 UTC); `<с>` — регулярка на это время и позже, например `^2026-11-27T(13:(2[3-9]|[3-5][0-9])|1[4-9]:)`:

```bash
prod 'cat ~/.pm2/logs/mybook-backend-error*.log ~/.pm2/logs/mybook-worker-error*.log | grep -E "<с>" | tail -20'
```

Живой трафик — по тому, что менялось:
- **WhatsApp (GOWA)**: новые строки в `crm_messages` после времени выкатки
  (`psql "$(grep ^DATABASE_URL= ~/mybook/.env | cut -d= -f2-)" -c "select direction, count(*), max(created_at) from crm_messages where created_at > '<UTC-время выкатки>' group by 1"`).
  Паузы по 5–10 минут бывают, особенно вечером, — подождать, прежде чем бить тревогу.
- **Вебхуки без побочных эффектов**: `POST localhost:3046/api/integrations/gowa` с `{}` → 403 (подпись),
  `POST /api/payments/kaspi/webhook` с `{}` → 200 `ignored`.
- **nginx**: коды ответов после выкатки (через ubuntu, см. выше) — 5xx быть не должно.

Пользователю коротко: какой релиз на проде, что уехало, что проверено, что не проверено (например, PDF или живой платёж).

## Откат

Только по просьбе пользователя или когда прод лежит после выкатки:

```bash
prod 'ls -1t ~/mybook-releases/releases'
prod 'cd ~/mybook && bash deploy/rollback.sh'               # на предыдущий
prod 'cd ~/mybook && bash deploy/rollback.sh <релиз>'       # на конкретный
```

Миграции БД не откатываются: они только добавляют таблицы и колонки, старый код с ними работает. Следующий пуш в `master`
снова выкатит новый код — после отката починить причину, а не пушить сверху.

## Диагностика без выкатки

```bash
prod 'pm2 ls'                                     # статусы (чужие процессы не трогать)
prod 'curl -s localhost:3046/api/v1/health'
prod 'pm2 logs mybook-backend --nostream --lines 200'
prod 'free -m; df -h ~'
```
