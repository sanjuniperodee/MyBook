# Приложение переехало в mybook-mobile

С 26.11.2026 мобильные приложения (CRM и клиентское «MyBooks», Flutter) живут в отдельном приватном репозитории
**https://github.com/sanjuniperodee/mybook-mobile** (ADR 0013, `docs/microservices/adr/0013-three-repositories.md`).
История этой папки перенесена туда `git filter-repo`.

**Здесь больше ничего не править** — правки делаются в `mybook-mobile`. Папка остаётся, пока CI `mybook-mobile` не
зелёный и сборка клиента из него не проверена; потом её удаляют отдельным коммитом вместе с `scripts/mobile/ios-adhoc.sh`,
`asc.mjs` и `upload-apk.sh` (их копии — в `mybook-mobile/scripts`).

Что осталось в бэкенде:
- генератор Dart-клиента API v1: `npx tsx scripts/contracts/generate.ts --dart <checkout mybook-mobile>/lib/api/mybook_api.g.dart`,
  проверка свежести: `npx tsx scripts/contracts/check-dart.ts <checkout mybook-mobile>`;
- приём и раздача сборок на `/admin/app`: `scripts/mobile/ios-devices.ts`, `scripts/mobile/upload-apk.ts`,
  `src/server/ios-app.ts`, `src/server/ios-sign.ts`, `src/server/mobile-apk.ts` (скрипты приложения зовут их по ssh).
