/**
 * Генерация из контракта API v1 (packages/contracts): OpenAPI (packages/contracts/openapi.json) и Dart-клиент
 * (mobile/lib/api/mybook_api.g.dart). Запуск: npx tsx scripts/contracts/generate.ts. Устаревшие файлы роняют тест
 * tests/contracts.test.ts (CI) — после правки контракта перезапустить генерацию и закоммитить результат.
 */
import { writeFileSync } from "node:fs";
import { generated } from "./files";

for (const [file, text] of Object.entries(generated())) {
  writeFileSync(file, text);
  console.log(`contracts: ${file}`);
}
