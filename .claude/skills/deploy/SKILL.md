---
name: deploy
description: Выкатить MyBooks (mybooks.kz) на прод-сервер по SSH — проверки перед пушем, deploy/deploy.sh в фоне с логом, ожидание итога, проверка сайта, откат. Использовать, когда просят «задеплой», «выкати на прод», «обнови сайт», «откати прод», или спрашивают, что сейчас на проде.
---

# Деплой MyBooks на прод

## Доступ

```bash
ssh -i ~/.ssh/bilimland-prod/ssh-key-1778196525864 -o BatchMode=yes -o ConnectTimeout=15 sanjuniperodee@94.131.93.92 '<команда>'
```

Дальше `prod '<команда>'` — это эта строка. Состояние оболочки между вызовами Bash не сохраняется, поэтому в начале каждого вызова объявлять функцию (переменная `$PROD` в zsh не разбивается на аргументы — не работает):

```bash
prod() { ssh -i ~/.ssh/bilimland-prod/ssh-key-1778196525864 -o BatchMode=yes -o ConnectTimeout=15 sanjuniperodee@94.131.93.92 "$@"; }
```

 Пароль не нужен (BatchMode); если ssh просит пароль или отказывает — остановиться и сказать пользователю, ключи не искать и не генерировать.

| Что | Где |
|---|---|
| Репозиторий | `~/mybook` (ветка `master`, неглубокий клон — последние коммиты; `.env` и `deploy/*` для выкатки). В `node_modules` нет сборочного (компилятор Next, typescript, vite, eslint) — только для разовых скриптов |
| Разовые скрипты | из `~/mybook`: `SCHEDULER=off PDF_WORKER=off node_modules/.bin/tsx --env-file-if-exists=.env --import ./scripts/preload.mjs scripts/<скрипт>.ts`; проверка, что запуск работает, — `scripts/ops/check.ts` (06-operations §2.8) |
| Релизы | `~/mybook-releases/releases/<время>-<sha>`, работает симлинк `~/mybook-releases/current` |
| Процессы PM2 | `mybook` (порт 3040), `mybook-gowa` (шлюз WhatsApp), `kaspi-pos` |
| Сайт | https://mybooks.kz, здоровье — `/api/health` |
| Логи выкаток | `~/mybook-deploy-<sha>.log` |

Сервер общий: на нём ещё bilimland, balapan, ilmhub и др. Трогать только `mybook*`. Не перезапускать чужие процессы PM2, не менять nginx, `.env` и базы данных без прямой просьбы. `kaspi-pos` общий с my-test.kz — не перезапускать.

Ручная выкатка со сборкой на сервере (запасной путь ниже) сначала сама поставит зависимости заново (`npm ci`, ~1 ГБ на диске) — сборочных пакетов в `~/mybook/node_modules` нет.

Машина небольшая (4 ядра, 8 ГБ, рядом чужие проекты): вся выкатка идёт 20–25 минут, почти всё время — сборка на одном ядре. Две выкатки одновременно не запускать.

Если сборка висит на «Creating an optimized production build» дольше 15 минут, а процесс `next-build` почти не тратит процессорного времени (`ps -o time=`), он упёрся в потолок памяти cgroup и перечитывает диск по кругу (`/proc/pressure/io` — десятки процентов), а сайт тормозит. Остановить группу процессов `deploy.sh` (`kill -TERM -- -<pgid>`), проверить размер `.next/cache/turbopack` (deploy.sh сам чистит его, если больше 1200 МБ) и потолок `MYBOOK_BUILD_MEM`.

## С 19.10.2026 выкатка идёт через GitHub Actions

Пуш в `master` сам запускает `.github/workflows/deploy.yml`: на GitHub проходят типы, линтер, тесты и сборка, на сервер уезжает готовый архив, и `deploy/deploy.sh --artifact` выкатывает его (smoke-тест, переключение, откат). Сервер больше не собирает. Ход и итог: `gh run list -R sanjuniperodee/MyBook -L 3`, `gh run watch <id> -R sanjuniperodee/MyBook`; лог на сервере — `~/mybook-deploy-<sha7>.log`. Повторить выкатку: `gh workflow run deploy.yml -R sanjuniperodee/MyBook`. Так же устроены DoseWear (`main`) и my-test (`sanjuniperodee/mytest.kz`, `main`). Ручной порядок ниже — запасной, если GitHub недоступен.

## Порядок

### 1. Что уезжает

```bash
git fetch -q origin
prod 'basename "$(readlink -f ~/mybook-releases/current)"'   # <время>-<sha> на проде
git log --oneline <sha-прода>..origin/master
```

Показать пользователю список коммитов, которые уедут. Если нужное ещё не в `origin/master`, его надо закоммитить и запушить (или смёржить PR). Пуш в `master` делать только по явному «да» пользователя в этом разговоре.

### 2. Проверки до пуша

`deploy.sh` при сборке типы не проверяет (на сервере не хватает памяти), поэтому локально, на том коде, который уезжает:

```bash
npx tsc --noEmit && npm run lint && npm test
```

Если что-то упало — не выкатывать, показать ошибку.

### 3. Выкатка

Сначала убедиться, что другой выкатки нет:

```bash
prod 'pgrep -af "^bash deploy/deploy.sh" || echo free'
```

Идёт — не запускать вторую, сказать пользователю и дождаться её итога (её лог — самый свежий `~/mybook-deploy-*.log`, или вывод в той сессии, что её запустила).

Бэкап базы перед выкаткой (миграции применяются автоматически):

```bash
prod 'cd ~/mybook && URL=$(grep "^DATABASE_URL=" .env | cut -d= -f2-) && pg_dump "$URL" | gzip > ~/mybook-predeploy-$(date +%Y%m%d-%H%M).sql.gz && ls -lh ~/mybook-predeploy-*.sql.gz | tail -1'
```

Запуск в фоне. Здесь нужен `ssh -n` (stdin из /dev/null) и подоболочка, а не функция `prod`: иначе ssh висит до конца выкатки. Если всё же повис, а в списке `pgrep` выкатка есть — она идёт, дальше проверять по логу. Bash-вызов с запуском делать в фоне (`run_in_background`). В macOS нет `timeout`.

```bash
SHA=$(git rev-parse --short origin/master)
ssh -n -i ~/.ssh/bilimland-prod/ssh-key-1778196525864 -o BatchMode=yes sanjuniperodee@94.131.93.92 "cd ~/mybook && (setsid nohup bash deploy/deploy.sh master > ~/mybook-deploy-$SHA.log 2>&1 < /dev/null &); echo started"
```

### 4. Ждать итога

Опрашивать лог раз в 60–90 с (Bash в фоне или `sleep 75` в команде), не чаще:

```bash
prod "tail -5 ~/mybook-deploy-$SHA.log; pgrep -f "^bash deploy/deploy.sh" >/dev/null && echo RUNNING || echo DONE"
```

- `✓ MyBooks отвечает на localhost:3040 (<релиз>)` — выкатилось.
- `✗ Новая версия не прошла проверку` — прод не тронут, старая версия работает. Показать хвост лога (`tail -60`) с причиной.
- `✗ После переключения приложение не ответило` — скрипт сам откатывает на предыдущий релиз. Проверить здоровье и логи: `prod 'pm2 logs mybook --nostream --lines 100'`.

Скрипт сам шлёт итог в WhatsApp-группу «MyBooks» (deploy/notify.mjs) — дублировать не нужно.

### 5. Проверка снаружи

```bash
curl -s https://mybooks.kz/api/health          # "ok":true, "db":true
curl -s -o /dev/null -w "%{http_code}\n" https://mybooks.kz/
```

Плюс открыть страницы, которые менялись в этом деплое (например `curl -s -o /dev/null -w "%{http_code}" https://mybooks.kz/love`), и сверить, что релиз в `current` имеет нужный sha.

Пользователю коротко: какой релиз на проде, что уехало (коммиты), что проверено, что не проверено.

## Откат

Только по просьбе пользователя или когда прод лежит после выкатки:

```bash
prod 'ls -1t ~/mybook-releases/releases'                    # хранятся 3 последних
prod 'cd ~/mybook && bash deploy/rollback.sh'               # на предыдущий
prod 'cd ~/mybook && bash deploy/rollback.sh <релиз>'       # на конкретный
```

Миграции БД не откатываются: они только добавляют таблицы и колонки, старый код с ними работает.

## Диагностика без выкатки

```bash
prod 'pm2 ls | grep -E "mybook|kaspi"'                   # статусы процессов
prod 'curl -s localhost:3040/api/health'
prod 'pm2 logs mybook --nostream --lines 200'
prod 'free -m; df -h ~'
```
