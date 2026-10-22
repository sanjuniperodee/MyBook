import "server-only";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { deleteFile, putFile, storagePath } from "@/shared/infrastructure/storage";
import type { CallRecordingStore } from "../application";

/** Форматы записи браузера (MediaRecorder): Chrome/Edge — WebM, Safari — MP4, Firefox — Ogg. */
const EXT: Record<string, string> = { "audio/webm": "webm", "audio/mp4": "mp4", "audio/ogg": "ogg" };
const FINAL = "call.m4a";

const dir = (callId: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(callId)) throw new Error("Неверный id звонка");
  return `call-recordings/${callId}`;
};

async function parts(callId: string) {
  try {
    return (await fs.readdir(storagePath(`${dir(callId)}/parts`))).filter((f) => /^\d{6}\.(webm|mp4|ogg)$/.test(f)).sort();
  } catch {
    return [];
  }
}

/** ffmpeg: запись браузера → AAC (m4a) моно 48 кбит/с — играет в любом браузере, с перемоткой. */
function toM4a(input: string, output: string): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-vn", "-ac", "1", "-c:a", "aac", "-b:a", "48k", "-movflags", "+faststart", output], { stdio: "ignore" });
    const timer = setTimeout(() => p.kill("SIGKILL"), 120_000);
    p.on("error", () => (clearTimeout(timer), resolve(false)));
    p.on("close", (code) => (clearTimeout(timer), resolve(code === 0)));
  });
}

/**
 * Записи разговоров WhatsApp на диске сайта (STORAGE_DIR/call-recordings/<id звонка>/). Браузер присылает запись кусками
 * по 10 с (куски одного потока MediaRecorder, склеиваются по порядку); при первом прослушивании законченного звонка куски
 * склеиваются и перекодируются в m4a. Кусок, пришедший позже (вкладка доотправила хвост), сбрасывает готовый файл — он
 * соберётся заново. Без ffmpeg отдаётся склейка как есть.
 */
export const localCallRecordings: CallRecordingStore = {
  async append(callId, seq, mime, data) {
    const ext = EXT[mime];
    if (!ext) throw new Error("Неподдерживаемый формат записи");
    await putFile(`${dir(callId)}/parts/${String(seq).padStart(6, "0")}.${ext}`, data);
    await deleteFile(`${dir(callId)}/${FINAL}`);
  },

  async file(callId) {
    const base = dir(callId);
    const final = storagePath(`${base}/${FINAL}`);
    if (await fs.stat(final).then((s) => s.size > 0, () => false)) return { path: final, mime: "audio/mp4" };
    const list = await parts(callId);
    if (!list.length) return null;
    const ext = path.extname(list[0]).slice(1);
    const mime = Object.keys(EXT).find((m) => EXT[m] === ext)!;
    // Склейка и перекодирование — во временные файлы, на место — переименованием: два одновременных прослушивания не мешают друг другу.
    const tmp = randomUUID();
    const raw = storagePath(`${base}/raw-${tmp}.${ext}`);
    const out = storagePath(`${base}/${FINAL}.${tmp}.m4a`);
    const write = createWriteStream(raw);
    for (const f of list) await pipeline(createReadStream(storagePath(`${base}/parts/${f}`)), write, { end: false });
    await new Promise<void>((resolve, reject) => write.end((err?: Error | null) => (err ? reject(err) : resolve())));
    if (await toM4a(raw, out)) {
      await fs.rename(out, final);
      await fs.rm(raw, { force: true });
      return { path: final, mime: "audio/mp4" };
    }
    await fs.rm(out, { force: true });
    const fallback = storagePath(`${base}/call.${ext}`);
    await fs.rename(raw, fallback);
    return { path: fallback, mime };
  },
};
