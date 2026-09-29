import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "./env";

/** Локальное файловое хранилище. Ключи — относительные пути вида photos/<bookId>/<id>.jpg. */
const root = path.resolve(env.storageDir);

function resolveKey(key: string) {
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("Invalid storage key");
  return full;
}

export async function putFile(key: string, data: Buffer | Uint8Array | string) {
  const full = resolveKey(key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data);
}

export async function getFile(key: string): Promise<Buffer> {
  return fs.readFile(resolveKey(key));
}

export async function fileExists(key: string) {
  try {
    await fs.access(resolveKey(key));
    return true;
  } catch {
    return false;
  }
}

export async function deleteFile(key: string) {
  await fs.rm(resolveKey(key), { force: true });
}

export async function deletePrefix(prefix: string) {
  await fs.rm(resolveKey(prefix), { recursive: true, force: true });
}
