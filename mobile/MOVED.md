# Приложение переехало в mybook-mobile

С 26.11.2026 мобильные приложения (CRM и клиентское «MyBooks», Flutter) живут в отдельном приватном репозитории
**https://github.com/sanjuniperodee/mybook-mobile** (ADR 0013, `docs/microservices/adr/0013-three-repositories.md`).
История этой папки перенесена туда `git filter-repo`; из бэкенда код приложения и скрипты сборки (`ios-adhoc.sh`,
`asc.mjs`, `upload-apk.sh`) удалены.

В старых checkout бэкенда здесь могут остаться сборки и ключи подписи Android (`android/key.properties`,
`android/app/upload-keystore.jks`) — `.gitignore` их не пускает в git; ключи перенести в checkout `mybook-mobile`.

Что осталось в бэкенде:
- генератор Dart-клиента API v1: `npx tsx scripts/contracts/generate.ts --dart <checkout mybook-mobile>/lib/api/mybook_api.g.dart`,
  проверка свежести: `npx tsx scripts/contracts/check-dart.ts <checkout mybook-mobile>`; после пуша в master CI сам
  делает PR в приложение, если заведён секрет `MOBILE_REPO_TOKEN`;
- приём и раздача сборок на `/admin/app`: `scripts/mobile/ios-devices.ts`, `scripts/mobile/upload-apk.ts`,
  `src/server/ios-app.ts`, `src/server/ios-sign.ts`, `src/server/mobile-apk.ts` (скрипты приложения зовут их по ssh).
