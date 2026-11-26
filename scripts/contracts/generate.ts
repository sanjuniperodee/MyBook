/**
 * Генерация из контракта API v1 (packages/contracts): OpenAPI (packages/contracts/openapi.json) и Dart-клиент приложения.
 *   npx tsx scripts/contracts/generate.ts                                                  — только OpenAPI
 *   npx tsx scripts/contracts/generate.ts --dart ../mybook-mobile/lib/api/mybook_api.g.dart — и Dart-клиент в checkout
 *                                                                                            mybook-mobile (ADR 0013)
 * Устаревший openapi.json роняет тест tests/api-v1.test.ts (CI); клиент в приложении проверяет
 * scripts/contracts/check-dart.ts, а после пуша в master новый клиент приходит в mybook-mobile пулл-реквестом из CI
 * (задача mobile-client-pr в deploy.yml, при секрете MOBILE_REPO_TOKEN).
 */
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { generated } from "./files";

const args = process.argv.slice(2);
const at = args.indexOf("--dart");
const dart = at >= 0 ? args[at + 1] : undefined;
if (at >= 0 && (!dart || !existsSync(path.dirname(dart)))) {
  console.error("contracts: --dart <checkout mybook-mobile>/lib/api/mybook_api.g.dart — папки нет или путь не указан");
  process.exit(1);
}

for (const [file, text] of Object.entries(generated(dart))) {
  writeFileSync(file, text);
  console.log(`contracts: ${file}`);
}
if (!dart) console.log("contracts: Dart-клиент не записан — добавьте --dart <checkout mybook-mobile>/lib/api/mybook_api.g.dart");
