# mybook-files — отдача файлов хранилища (Go, пилот G3)

План — [docs/microservices/10-go-plan-2026-11-24.md](../../docs/microservices/10-go-plan-2026-11-24.md) §4, решение —
[ADR 0011](../../docs/microservices/adr/0011-go-services-strangler.md). Замеры и гейт — [perf.md](../../docs/microservices/perf.md).

- **Что делает:** `GET/HEAD /files/<payload>.<подпись>` — файл из S3 PS Cloud (или с диска `STORAGE_DIR`, если его ещё нет
  в бакете, и кэш `cache/…` — только диск) потоком, с одним диапазоном Range, ETag, If-None-Match и заголовками маршрута
  сайта. `GET /healthz` — «ok». Только стандартная библиотека Go.
- **Права не проверяет.** Ссылку выдаёт сайт после своей проверки (`src/server/files-service.ts`): HMAC-SHA256 ключом
  `HMAC(APP_SECRET, "mybook-files/v1")`, срок — 6 ч. Заголовки из ссылки — только из `allowedHeaders` (token.go).
- **Настройки** — из `.env` сайта (`-env`): `APP_SECRET`, `STORAGE_DIR`, `S3_*`; `FILES_PORT` (3050), `FILES_HOST` (127.0.0.1).
- **Журнал:** раз в 5 минут память и счётчики в `~/mybook-logs/perf-ГГГГ-ММ.jsonl` (как у сайта, `kind: mem/files`).
- **Сборка и запуск:** `go test ./... && go vet ./...`; `bash build.sh <папка>` — бинарник linux/amd64. CI кладёт его в релиз
  (`bin/mybook-files`), PM2 запускает приложение `mybook-files` (deploy/ecosystem.config.cjs), `deploy.sh` перезапускает
  при каждой выкатке. Без бинарника в релизе (или `MYBOOK_FILES=off`) сервиса нет, сайт отдаёт файлы сам.
- **Включение и откат без выкатки** — режим сайта: файл `~/mybook-flags/files-service` (`off` | `proxy` | `redirect`),
  читается раз в 10 с; иначе `FILES_SERVICE` в `.env`. Сервис не отвечает — сайт отдаёт сам.
- **Сверка со старым путём:** `scripts/files/parity.ts` (статус, sha256 тела, заголовки на выборке файлов бакета).
