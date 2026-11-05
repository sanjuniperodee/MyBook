import "server-only";
import { spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/shared/infrastructure/db";
import { answerFiles, type AnswerFileRow } from "@/shared/infrastructure/db/schema";
import { deleteFile, storagePath } from "@/shared/infrastructure/storage";
import { MAX_OUTPUT_BYTES, MAX_SECONDS, parseProbe, posterArgs, targetSize, transcodeArgs, type FileError, type FileKind, type ProbeResult } from "@/lib/book/answer-files";
import { bookFileQuota, fileDirKey, mediaKey, posterKey, sourceKey } from "./answerFiles";

/**
 * Очередь обработки своих видео и аудио: по одному файлу на процесс сайта, ffmpeg с пониженным приоритетом (nice) и двумя
 * потоками — сервер общий с другими сайтами. Очередь — в базе (status queued): переживает перезапуск, а два процесса
 * (старый и новый на время выкатки) не возьмут один файл (SKIP LOCKED). Пока файл обрабатывается, отметка locked_at
 * обновляется раз в минуту; файл без отметки дольше STALE_MS (процесс убили посреди работы) берётся заново, до 3 попыток.
 */

const HEARTBEAT_MS = 60_000;
const STALE_MS = 5 * 60_000;
const MAX_ATTEMPTS = 3;
const THREADS = 2;

const running = new Set<ChildProcess>();
let hooked = false;
/** Процесс сайта завершается (выкатка) — ffmpeg не должен остаться работать сиротой. */
function track(child: ChildProcess) {
  if (!hooked) {
    hooked = true;
    process.once("exit", () => {
      for (const c of running) c.kill("SIGKILL");
    });
  }
  running.add(child);
  child.once("close", () => running.delete(child));
}

/** Запуск программы с nice; код выхода и stdout. Не нашлась программа — code null. */
function run(cmd: string, args: string[], timeoutMs: number): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("nice", ["-n", "15", cmd, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    track(child);
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d: Buffer) => (stdout = (stdout + d.toString()).slice(-200_000)));
    child.stderr?.on("data", (d: Buffer) => (stderr = (stderr + d.toString()).slice(-4000)));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("error", () => (clearTimeout(timer), resolve({ code: null, stdout, stderr })));
    child.on("close", (code) => (clearTimeout(timer), resolve({ code, stdout, stderr })));
  });
}

export async function probe(file: string): Promise<ProbeResult | null> {
  const r = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], 60_000);
  if (r.code !== 0) return null;
  try {
    return parseProbe(JSON.parse(r.stdout));
  } catch {
    return null;
  }
}

/** Пережать файл: готовый — out, кадр-обложка видео — poster (если получилось). false — ffmpeg не справился. */
export async function transcode(kind: FileKind, info: ProbeResult, input: string, out: string, poster: string | null): Promise<boolean> {
  // На двух потоках минута 720p — около минуты; запас ×6 и не меньше 15 минут.
  const timeout = Math.min(120 * 60_000, Math.max(15 * 60_000, info.durationSec * 6_000));
  const r = await run("ffmpeg", transcodeArgs(kind, info, input, out, THREADS), timeout);
  if (r.code !== 0) {
    if (r.stderr) console.warn("[answer-files] ffmpeg failed", r.stderr.slice(-600));
    return false;
  }
  if (poster) await run("ffmpeg", posterArgs(out, poster, info.durationSec), 60_000);
  return true;
}

class JobError extends Error {
  constructor(public code: FileError) {
    super(code);
  }
}

/** Взять следующий файл из очереди (или зависший). */
async function claim(): Promise<AnswerFileRow | null> {
  const stale = new Date(Date.now() - STALE_MS);
  const r = await db.execute<{ id: string }>(sql`
    update answer_files set status = 'processing', locked_at = now(), attempts = attempts + 1, updated_at = now()
    where id = (
      select id from answer_files
      where status = 'queued' or (status = 'processing' and (locked_at is null or locked_at < ${stale}))
      order by created_at
      limit 1
      for update skip locked
    )
    returning id`);
  const id = r.rows[0]?.id;
  if (!id) return null;
  const [row] = await db.select().from(answerFiles).where(eq(answerFiles.id, id));
  return row ?? null;
}

async function fail(file: AnswerFileRow, code: FileError) {
  await db
    .update(answerFiles)
    .set({ status: "failed", error: code, lockedAt: null, updatedAt: new Date() })
    .where(and(eq(answerFiles.id, file.id), eq(answerFiles.status, "processing")));
  await deleteFile(sourceKey(file.id));
  await fs.rm(storagePath(fileDirKey(file)), { recursive: true, force: true });
}

async function process1(file: AnswerFileRow) {
  if (file.attempts > MAX_ATTEMPTS) throw new JobError("server");
  const input = storagePath(sourceKey(file.id));
  if (!(await fs.stat(input).then((s) => s.size > 0, () => false))) throw new JobError("abandoned");
  const info = await probe(input);
  if (!info) throw new JobError("damaged");
  // «Видео» без картинки (запись звука в .mp4) — это аудио.
  const kind: FileKind = file.kind === "video" && !info.hasVideo ? "audio" : file.kind;
  if (kind === "audio" && !info.hasAudio) throw new JobError("damaged");
  if (info.durationSec > MAX_SECONDS[kind] + 1) throw new JobError("tooLong");
  const quota = await bookFileQuota(file.bookId, db, file.id);
  if (info.durationSec > quota.leftSec + 1) throw new JobError("quota");

  const target = { ...file, kind };
  const out = storagePath(mediaKey(target));
  const tmp = `${out}.part`;
  const posterOut = kind === "video" ? storagePath(posterKey(file)) : null;
  await fs.mkdir(path.dirname(out), { recursive: true });
  if (!(await transcode(kind, info, input, tmp, posterOut))) throw new JobError("damaged");
  const bytes = (await fs.stat(tmp)).size;
  if (bytes > MAX_OUTPUT_BYTES) throw new JobError("tooBig");
  await fs.rename(tmp, out);
  const hasPoster = !!posterOut && (await fs.stat(posterOut).then((s) => s.size > 0, () => false));
  const frame = kind === "video" && info.width && info.height ? targetSize(info.width, info.height) : null;
  const [done] = await db
    .update(answerFiles)
    .set({ status: "ready", kind, durationSec: Math.max(1, Math.round(info.durationSec)), width: frame?.width ?? null, height: frame?.height ?? null, bytes, hasPoster, error: null, lockedAt: null, readyAt: new Date(), updatedAt: new Date() })
    .where(and(eq(answerFiles.id, file.id), eq(answerFiles.status, "processing")))
    .returning({ id: answerFiles.id });
  await deleteFile(sourceKey(file.id));
  // Файл удалили, пока он обрабатывался, — готовый результат никому не нужен.
  if (!done) await fs.rm(storagePath(fileDirKey(file)), { recursive: true, force: true });
}

async function processWithHeartbeat(file: AnswerFileRow) {
  const beat = setInterval(() => {
    void db
      .update(answerFiles)
      .set({ lockedAt: new Date() })
      .where(and(eq(answerFiles.id, file.id), eq(answerFiles.status, "processing")))
      .catch(() => {});
  }, HEARTBEAT_MS);
  try {
    await process1(file);
  } catch (err) {
    if (err instanceof JobError) await fail(file, err.code);
    else {
      console.error("[answer-files] processing failed", file.id, err);
      // Сбой не из-за файла (база, диск): вернуть в очередь — следующий проход попробует снова, после 3 попыток — ошибка.
      if (file.attempts >= MAX_ATTEMPTS) await fail(file, "server").catch(() => {});
      else await db.update(answerFiles).set({ status: "queued", lockedAt: null }).where(eq(answerFiles.id, file.id)).catch(() => {});
      return false;
    }
  } finally {
    clearInterval(beat);
  }
  return true;
}

const state = globalThis as unknown as { __mybookAnswerFiles?: { running: boolean; again: boolean } };
const flags = () => (state.__mybookAnswerFiles ??= { running: false, again: false });

/**
 * Разобрать очередь: по одному файлу, пока есть. Повторный вызов во время работы не запускает второй обработчик, а
 * просит пройти очередь ещё раз. Вызывается после загрузки, при старте сайта и из планировщика.
 */
export function kickAnswerFiles() {
  const f = flags();
  if (f.running) {
    f.again = true;
    return;
  }
  f.running = true;
  void (async () => {
    try {
      do {
        f.again = false;
        for (;;) {
          const file = await claim();
          if (!file) break;
          // Сбой базы или диска — не крутимся вхолостую: следующая попытка — со следующим вызовом.
          if (!(await processWithHeartbeat(file))) return;
        }
      } while (f.again);
    } catch (err) {
      console.error("[answer-files] queue failed", err);
    } finally {
      f.running = false;
    }
  })();
}
