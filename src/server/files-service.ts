import "server-only";
import { createHmac } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Отдача файлов хранилища через Go-сервис mybook-files (services/files, пилот G3, ADR 0011): сайт проверяет права,
 * как раньше, и выдаёт подписанную ссылку; байты из S3 или с диска отдаёт сервис — с теми же Range, ETag и
 * заголовками маршрута. Права сервис не проверяет, только подпись (HMAC от APP_SECRET) и срок.
 *
 * Режим (FILES_SERVICE в .env, файл-флаг главнее — переключение без выкатки и без перезапуска, читается раз в 10 с):
 *   off      — как раньше: сайт отдаёт поток сам (storage.openStoredFile). По умолчанию.
 *   proxy    — сайт запрашивает файл у сервиса на 127.0.0.1 и передаёт поток браузеру (без лишнего запроса браузера).
 *   redirect — 302 на /files/<ссылка> того же домена: next.config.ts переписывает /files/* на сервис, а строка nginx
 *              (docs/microservices/06-operations.md) пускает их мимо Next — тогда байты совсем не идут через сайт.
 * Файл-флаг: <STORAGE_DIR>/../mybook-flags/files-service (одно слово: off | proxy | redirect); MYBOOK_FLAGS_DIR меняет папку.
 * Сервис не отвечает (остановлен, упал) — сайт сам отдаёт старым путём: проверка /healthz не чаще раза в 10 с.
 */
export type FilesMode = "off" | "proxy" | "redirect";

const MODES: readonly FilesMode[] = ["off", "proxy", "redirect"];
const parseMode = (v: string | undefined): FilesMode | null => {
  const m = v?.trim().toLowerCase();
  return MODES.includes(m as FilesMode) ? (m as FilesMode) : null;
};

export const filesPort = (env: Record<string, string | undefined> = process.env) => Number(env.FILES_PORT) || 3050;
export const filesOrigin = (env: Record<string, string | undefined> = process.env) => `http://127.0.0.1:${filesPort(env)}`;

/** Подпись ссылки — как проверяет сервис (services/files/token.go). */
const KEY_LABEL = "mybook-files/v1";
export const filesSigningKey = (appSecret: string) => createHmac("sha256", appSecret).update(KEY_LABEL).digest();

export type FileToken = { key: string; type: string; headers?: Record<string, string>; expires: number };

export function signFileToken(t: FileToken, signingKey: Buffer): string {
  const body: Record<string, unknown> = { k: t.key, t: t.type, x: t.expires };
  if (t.headers && Object.keys(t.headers).length) body.h = t.headers;
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${payload}.${createHmac("sha256", signingKey).update(payload).digest("base64url")}`;
}

/** Срок ссылки, с: на время просмотра видео с перемоткой; повторное открытие страницы выдаст новую. */
const TTL_SEC = 6 * 60 * 60;

const flagFile = (env: Record<string, string | undefined> = process.env) =>
  path.join(env.MYBOOK_FLAGS_DIR || path.join(path.dirname(path.resolve(env.STORAGE_DIR || "./storage")), "mybook-flags"), "files-service");

let flag: { mode: FilesMode | null; checkedAt: number; mtimeMs: number } = { mode: null, checkedAt: 0, mtimeMs: -1 };
let health: { ok: boolean; checkedAt: number; inflight?: Promise<boolean> } = { ok: false, checkedAt: 0 };
const RECHECK_MS = 10_000;

/** Режим сейчас: файл-флаг, иначе FILES_SERVICE; неизвестное значение — off. */
export async function filesMode(env: Record<string, string | undefined> = process.env, now = Date.now()): Promise<FilesMode> {
  if (now - flag.checkedAt >= RECHECK_MS) {
    flag.checkedAt = now;
    const st = await stat(flagFile(env)).catch(() => null);
    if (!st) flag = { mode: null, checkedAt: now, mtimeMs: -1 };
    else if (st.mtimeMs !== flag.mtimeMs) flag = { mode: parseMode(await readFile(flagFile(env), "utf8").catch(() => "")), checkedAt: now, mtimeMs: st.mtimeMs };
  }
  return flag.mode ?? parseMode(env.FILES_SERVICE) ?? "off";
}

/** Жив ли сервис: /healthz, результат держится 10 с; параллельные запросы ждут одну проверку. */
async function healthy(now = Date.now()): Promise<boolean> {
  if (now - health.checkedAt < RECHECK_MS) return health.ok;
  health.inflight ??= fetch(`${filesOrigin()}/healthz`, { signal: AbortSignal.timeout(500) })
    .then((r) => r.ok)
    .catch(() => false)
    .then((ok) => {
      health = { ok, checkedAt: Date.now() };
      return ok;
    });
  return health.inflight;
}

/** Для тестов: забыть флаг и здоровье сервиса. */
export function resetFilesServiceState() {
  flag = { mode: null, checkedAt: 0, mtimeMs: -1 };
  health = { ok: false, checkedAt: 0 };
}

/** Заголовки ответа сервиса, которые сайт передаёт браузеру в режиме proxy (общие заголовки сайта Next ставит сам). */
const PASS = ["content-type", "content-length", "content-range", "accept-ranges", "etag", "cache-control", "content-disposition", "content-security-policy", "x-content-type-options", "x-robots-tag", "cross-origin-resource-policy"];

/**
 * Отдать файл хранилища через mybook-files, если он включён и жив. null — отдавать старым путём (сайт сам): режим off,
 * сервис не отвечает или нет APP_SECRET. headers — заголовки маршрута (Cache-Control, Content-Disposition, CSP, свой ETag).
 */
export async function viaFilesService(key: string, type: string, req: Request, headers: Record<string, string> = {}): Promise<Response | null> {
  const mode = await filesMode();
  const secret = process.env.APP_SECRET;
  if (mode === "off" || !secret || !(await healthy())) return null;
  const token = signFileToken({ key, type, headers, expires: Math.floor(Date.now() / 1000) + TTL_SEC }, filesSigningKey(secret));
  if (mode === "redirect") return new Response(null, { status: 302, headers: { Location: `/files/${token}`, "Cache-Control": "private, no-store" } });
  const forward: Record<string, string> = {};
  for (const h of ["range", "if-none-match"]) {
    const v = req.headers.get(h);
    if (v) forward[h] = v;
  }
  let upstream: Response;
  try {
    upstream = await fetch(`${filesOrigin()}/files/${token}`, { headers: forward, signal: req.signal });
  } catch {
    health = { ok: false, checkedAt: Date.now() };
    return null;
  }
  // Сбой хранилища у сервиса (502) — пусть сайт попробует сам, как раньше; 404 — тоже сам: маршрут ответит своей ошибкой.
  if (upstream.status >= 500 || upstream.status === 404) {
    await upstream.body?.cancel();
    return null;
  }
  const out = new Headers();
  for (const h of PASS) {
    const v = upstream.headers.get(h);
    if (v !== null) out.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
