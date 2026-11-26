/**
 * Совпадает ли Dart-клиент в checkout приложения (репозиторий mybook-mobile, ADR 0013) с текущим контрактом API v1.
 *   npx tsx scripts/contracts/check-dart.ts ../mybook-mobile      — путь к корню checkout приложения
 *   npx tsx scripts/contracts/check-dart.ts                       — mobile/ этого репозитория (пока папка есть)
 * Код выхода 1 и подсказка, если клиент устарел или его нет: перегенерировать (generate.ts --dart …) и сделать PR в приложение.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { DART_CLIENT_IN_APP, dartClient } from "./files";

const root = process.argv[2] ?? "mobile";
const file = path.join(root, DART_CLIENT_IN_APP);
if (!existsSync(file)) {
  console.error(`check-dart: нет ${file} — укажите путь к checkout mybook-mobile`);
  process.exit(1);
}
const want = dartClient();
const have = readFileSync(file, "utf8");
if (have === want) {
  console.log(`check-dart: ${file} совпадает с контрактом`);
  process.exit(0);
}
const a = have.split("\n");
const b = want.split("\n");
let line = 0;
while (line < Math.min(a.length, b.length) && a[line] === b[line]) line++;
console.error(`check-dart: ${file} устарел (первое расхождение — строка ${line + 1}; строк ${a.length} → ${b.length}).`);
console.error(`Обновить: npx tsx scripts/contracts/generate.ts --dart ${file}`);
process.exit(1);
