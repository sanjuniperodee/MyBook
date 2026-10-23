import "server-only";
import { fileExists, getFile, putFile } from "@/shared/infrastructure/storage";

/** Android-приложение продажника: APK лежит в локальном хранилище, скачивают его сотрудники через /api/admin/mobile-apk. */
export const MOBILE_APK_KEY = "mobile/mybooks-crm.apk";
export const MOBILE_APK_NAME = "MyBooks-CRM.apk";
export const MOBILE_APK_MAX_BYTES = 150 * 1024 * 1024;

/** APK — это zip-архив: первые два байта «PK». Битый или не тот файл отсекается до записи. */
export function looksLikeApk(data: Uint8Array): boolean {
  return data.length > 4 && data[0] === 0x50 && data[1] === 0x4b;
}

export function hasMobileApk() {
  return fileExists(MOBILE_APK_KEY);
}

export function readMobileApk() {
  return getFile(MOBILE_APK_KEY);
}

export function saveMobileApk(data: Uint8Array) {
  return putFile(MOBILE_APK_KEY, data);
}
