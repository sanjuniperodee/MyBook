import "server-only";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { convertAudioToFile } from "@/server/audio-convert";
import { container } from "@/server/container";
import { putFile, storagePath } from "@/shared/infrastructure/storage";

/** Что телефон играет без перекодировки: AAC/MP3 из WhatsApp и наших ответов. Остальное (Ogg Opus, WebM) идёт через ffmpeg в m4a. */
const PLAYABLE: Record<string, { ext: string; mime: string }> = {
  "audio/mp4": { ext: "m4a", mime: "audio/mp4" },
  "audio/x-m4a": { ext: "m4a", mime: "audio/mp4" },
  "audio/aac": { ext: "aac", mime: "audio/aac" },
  "audio/mpeg": { ext: "mp3", mime: "audio/mpeg" },
};
/** Расширение файла кэша → тип ответа. Порядок — порядок поиска. */
const CACHED = [
  { ext: "m4a", mime: "audio/mp4" },
  { ext: "aac", mime: "audio/aac" },
  { ext: "mp3", mime: "audio/mpeg" },
  { ext: "bin", mime: "application/octet-stream" },
];
const DIR = "chat-audio-cache";
const MAX_AGE_MS = 30 * 86_400_000;

const key = (mid: string, ext: string) => `${DIR}/${mid}.${ext}`;

async function cached(mid: string) {
  for (const c of CACHED) {
    const path = storagePath(key(mid, c.ext));
    if (await fs.stat(path).then((s) => s.size > 0, () => false)) return { path, mime: c.mime };
  }
  return null;
}

/** Раз в час стираем файлы кэша, к которым не обращались месяц: голосовые из старых чатов снова соберутся при открытии. */
let pruned = 0;
async function prune() {
  if (Date.now() - pruned < 3_600_000) return;
  pruned = Date.now();
  const dir = storagePath(DIR);
  for (const name of await fs.readdir(dir).catch(() => [] as string[])) {
    const path = `${dir}/${name}`;
    const st = await fs.stat(path).catch(() => null);
    if (st && Date.now() - st.atimeMs > MAX_AGE_MS && Date.now() - st.mtimeMs > MAX_AGE_MS) await fs.rm(path, { force: true }).catch(() => {});
  }
}

/** Идущая сборка по id сообщения: телефон шлёт несколько запросов подряд — файл собираем один раз. */
const building = new Map<string, Promise<{ path: string; mime: string } | null>>();

async function build(mid: string): Promise<{ path: string; mime: string } | null> {
  const file = await container().messaging.media.bytes(mid, 25_000_000);
  if (!file) return null;
  const mime = file.mime.split(";")[0].trim().toLowerCase();
  const ready = PLAYABLE[mime];
  if (ready) {
    await putFile(key(mid, ready.ext), file.data);
    return { path: storagePath(key(mid, ready.ext)), mime: ready.mime };
  }
  await fs.mkdir(storagePath(DIR), { recursive: true });
  // ffmpeg пишет во временный файл, на место — переименованием: недописанное не уйдёт телефону.
  const tmp = storagePath(key(`${mid}.${randomUUID()}`, "m4a"));
  if (await convertAudioToFile(file.data, "m4a", tmp)) {
    const final = storagePath(key(mid, "m4a"));
    await fs.rename(tmp, final);
    void prune();
    return { path: final, mime: "audio/mp4" };
  }
  await fs.rm(tmp, { force: true }).catch(() => {});
  // Без ffmpeg отдаём исходный файл как есть (на других машинах его может не быть).
  await putFile(key(mid, "bin"), file.data);
  return { path: storagePath(key(mid, "bin")), mime: file.mime || "application/octet-stream" };
}

/** Звук сообщения, готовый для телефона: из кэша на диске или собранный сейчас. null — файла нет. */
export async function chatAudioFile(mid: string): Promise<{ path: string; mime: string } | null> {
  const hit = await cached(mid);
  if (hit) return hit;
  const running = building.get(mid);
  if (running) return running;
  const job = build(mid).finally(() => building.delete(mid));
  building.set(mid, job);
  return job;
}
