import "server-only";
import { stat } from "node:fs/promises";
import path from "node:path";
import { env } from "@/config/env";
import { MediaDedup, type DedupResult } from "@/modules/messaging";

/**
 * Каталог вложений своего шлюза WhatsApp: WHATSAPP_MEDIA_DIR, иначе — как ставит deploy/sidecars.sh: папка
 * mybook-sidecars рядом с репозиторием и хранилищем (STORAGE_DIR=/home/…/mybook-storage → /home/…/mybook-sidecars).
 */
export function whatsappMediaDir(): string {
  if (env.whatsappMediaDir) return path.resolve(env.whatsappMediaDir);
  return path.join(path.dirname(path.resolve(env.storageDir)), "mybook-sidecars", "gowa", "statics", "media");
}

let dedup: MediaDedup | null = null;

/** Проход планировщика (раз в 15 минут): одинаковые вложения шлюза — ссылки на один файл. Каталога нет — null. */
export async function dedupWhatsappMedia(): Promise<DedupResult | null> {
  const dir = whatsappMediaDir();
  if (!(await stat(dir).then((s) => s.isDirectory()).catch(() => false))) return null;
  dedup ??= new MediaDedup(dir);
  return dedup.sweep();
}
