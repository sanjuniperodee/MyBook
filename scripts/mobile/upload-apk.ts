/**
 * Выложить APK приложения продажника туда же, куда его кладёт форма CRM «Сайт» → «Приложение для Android»
 * (хранилище, ключ mobile/mybooks-crm.apk; сотрудники скачивают по /api/admin/mobile-apk). Запуск на сервере:
 *   npx tsx --env-file-if-exists=.env --import ./scripts/preload.mjs scripts/mobile/upload-apk.ts /путь/MyBooks-CRM.apk
 * (обёртка с копированием файла — scripts/upload-apk.sh в репозитории mybook-mobile).
 */
import { readFile } from "node:fs/promises";
import { looksLikeApk, MOBILE_APK_KEY, MOBILE_APK_MAX_BYTES, saveMobileApk } from "@/server/mobile-apk";

const file = process.argv[2];
if (!file) {
  console.error("Укажите путь к APK");
  process.exit(1);
}
const data = new Uint8Array(await readFile(file));
if (!looksLikeApk(data)) throw new Error("Это не APK");
if (data.length > MOBILE_APK_MAX_BYTES) throw new Error("Файл больше 150 МБ");
await saveMobileApk(data);
console.log(`APK выложен: ${MOBILE_APK_KEY}, ${(data.length / 1024 / 1024).toFixed(1)} МБ`);
