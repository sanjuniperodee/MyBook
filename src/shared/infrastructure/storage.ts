import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "@/config/env";
import { createS3, type S3Client } from "./s3";

/**
 * Файловое хранилище. Ключи — относительные пути вида photos/<bookId>/<id>.jpg.
 *
 * С S3 (заданы S3_BUCKET и ключи доступа) основное место файлов — бакет, а папка STORAGE_DIR служит локальной копией:
 * запись идёт и на диск, и в бакет; чтение — с диска, а если файла там нет (новый сервер, очищенный кэш), он скачивается
 * из бакета и остаётся на диске. Программам, которым нужен путь к файлу (ffmpeg, pdftoppm, отдача по Range), — localPath:
 * он сначала докачивает файл. Записанное по пути напрямую выкладывается в бакет через publish.
 *
 * Пересобираемый кэш (cache/…, chat-audio-cache/…) живёт только на диске. Без S3 всё как раньше — только диск.
 */
const root = path.resolve(env.storageDir);
const LOCAL_ONLY = ["cache/", "chat-audio-cache/"];

let remote: S3Client | null | undefined;
function s3(): S3Client | null {
  if (remote !== undefined) return remote;
  const { S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
  remote =
    S3_BUCKET && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY
      ? createS3({
          endpoint: process.env.S3_ENDPOINT || "https://object.pscloud.io",
          region: process.env.S3_REGION || "us-east-1",
          bucket: S3_BUCKET,
          accessKeyId: S3_ACCESS_KEY_ID,
          secretAccessKey: S3_SECRET_ACCESS_KEY,
          prefix: process.env.S3_PREFIX ?? "mybooks/",
        })
      : null;
  return remote;
}

/** Есть ли у ключа копия в бакете (S3 включён и это не пересобираемый кэш). */
function remoteFor(key: string): S3Client | null {
  const client = s3();
  if (!client) return null;
  const norm = key.replace(/^\.\/+/, "");
  return LOCAL_ONLY.some((p) => norm.startsWith(p)) ? null : client;
}

function resolveKey(key: string) {
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("Invalid storage key");
  return full;
}

/** Нормализованный ключ (без «./», «a//b»), каким он лежит в бакете. */
function normKey(key: string) {
  return path.relative(root, resolveKey(key)).split(path.sep).join("/");
}

/**
 * Полный путь к файлу на диске — для записи программой (ffmpeg) и потоковой отдачи. Файла из бакета здесь может не
 * быть: для чтения по пути — localPath, после записи по пути — publish.
 */
export function storagePath(key: string) {
  return resolveKey(key);
}

const localExists = (full: string) => fs.access(full).then(() => true, () => false);

/** Путь к файлу на диске, при необходимости скачав его из бакета. null — файла нет нигде. */
export async function localPath(key: string): Promise<string | null> {
  const full = resolveKey(key);
  if (await localExists(full)) return full;
  const client = remoteFor(key);
  if (!client) return null;
  return (await client.download(normKey(key), full)) ? full : null;
}

/** Выложить в бакет файл, записанный на диск по storagePath (ffmpeg, rename временного файла). */
export async function publish(key: string) {
  const client = remoteFor(key);
  if (client) await client.putFile(normKey(key), resolveKey(key));
}

export async function putFile(key: string, data: Buffer | Uint8Array | string) {
  const full = resolveKey(key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data);
  await remoteFor(key)?.put(normKey(key), Buffer.isBuffer(data) ? data : Buffer.from(data));
}

export async function getFile(key: string): Promise<Buffer> {
  const full = resolveKey(key);
  try {
    return await fs.readFile(full);
  } catch (err) {
    const client = remoteFor(key);
    if (!client || (err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    const data = await client.get(normKey(key));
    if (!data) throw err;
    // Копия на диск — следующее чтение без бакета. Не вышло (нет места) — не мешает ответу.
    await fs
      .mkdir(path.dirname(full), { recursive: true })
      .then(() => fs.writeFile(full, data))
      .catch(() => {});
    return data;
  }
}

export async function fileExists(key: string) {
  if (await localExists(resolveKey(key))) return true;
  const client = remoteFor(key);
  return client ? client.exists(normKey(key)) : false;
}

export async function deleteFile(key: string) {
  await fs.rm(resolveKey(key), { force: true });
  await remoteFor(key)?.delete(normKey(key));
}

export async function deletePrefix(prefix: string) {
  await fs.rm(resolveKey(prefix), { recursive: true, force: true });
  const client = remoteFor(prefix);
  if (!client) return;
  const p = normKey(prefix).replace(/\/?$/, "/");
  for (const o of await client.list(p)) await client.delete(o.key);
}

/**
 * Содержимое папки хранилища — файлы и вложенные папки — со временем изменения: с S3 — по бакету (у папки — самый
 * свежий файл внутри), иначе по диску.
 */
export async function listFiles(prefix: string): Promise<{ name: string; modifiedMs: number }[]> {
  const client = remoteFor(prefix);
  if (client) {
    const p = normKey(prefix).replace(/\/?$/, "/");
    const byName = new Map<string, number>();
    for (const o of await client.list(p)) {
      const name = o.key.slice(p.length).split("/")[0];
      if (name) byName.set(name, Math.max(byName.get(name) ?? 0, o.modifiedMs));
    }
    return [...byName].map(([name, modifiedMs]) => ({ name, modifiedMs }));
  }
  const dir = resolveKey(prefix);
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  const entries = await Promise.all(names.map(async (name) => ({ name, modifiedMs: (await fs.stat(path.join(dir, name)).catch(() => null))?.mtimeMs })));
  return entries.flatMap((e) => (e.modifiedMs === undefined ? [] : [{ name: e.name, modifiedMs: e.modifiedMs }]));
}
