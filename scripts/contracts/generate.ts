/**
 * Генерация из контракта API v1 (packages/contracts): OpenAPI (packages/contracts/openapi.json) и Dart-клиент.
 *   npx tsx scripts/contracts/generate.ts                                        — Dart-клиент в mobile/lib/api/ (пока
 *                                                                                  папка есть, ADR 0013)
 *   npx tsx scripts/contracts/generate.ts --dart ../mybook-mobile/lib/api/mybook_api.g.dart — в checkout приложения
 * Устаревший openapi.json роняет тест tests/api-v1.test.ts (CI); клиент в приложении проверяет
 * scripts/contracts/check-dart.ts. После правки контракта — перезапустить генерацию и закоммитить результат в оба репозитория.
 */
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DART_CLIENT_DEFAULT, generated } from "./files";

const args = process.argv.slice(2);
const at = args.indexOf("--dart");
if (at >= 0 && !args[at + 1]) {
  console.error("--dart <путь к mybook_api.g.dart>");
  process.exit(1);
}
const dart = at >= 0 ? args[at + 1] : DART_CLIENT_DEFAULT;
if (!existsSync(path.dirname(dart))) {
  console.error(`contracts: нет папки ${path.dirname(dart)} — укажите --dart <checkout mybook-mobile>/lib/api/mybook_api.g.dart`);
  process.exit(1);
}

for (const [file, text] of Object.entries(generated(dart))) {
  writeFileSync(file, text);
  console.log(`contracts: ${file}`);
}
