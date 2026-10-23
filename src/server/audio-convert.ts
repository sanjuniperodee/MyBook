import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Одновременно не больше двух ffmpeg: открытый чат с десятком голосовых не должен занять все ядра сервера. */
const MAX_JOBS = 2;
let active = 0;
const waiting: (() => void)[] = [];
async function slot<T>(job: () => Promise<T>): Promise<T> {
  if (active >= MAX_JOBS) await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  try {
    return await job();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

export type AudioTarget = "m4a" | "ogg";

const TARGETS: Record<AudioTarget, { args: string[]; mime: string }> = {
  /** AAC в mp4: играет на iPhone (AVPlayer не знает Ogg Opus, в котором приходят голосовые WhatsApp). */
  m4a: { args: ["-vn", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart"], mime: "audio/mp4" },
  /** Opus в Ogg: формат голосовых сообщений WhatsApp. */
  ogg: { args: ["-vn", "-c:a", "libopus", "-b:a", "32k", "-ar", "48000", "-ac", "1", "-application", "voip"], mime: "audio/ogg; codecs=opus" },
};

/**
 * Перекодировать звук через ffmpeg (он есть на сервере; на других машинах его может не быть — тогда null и вызывающий
 * отдаёт исходный файл). Работает через временную папку: mp4 пишется с «moov» в начале, а это возможно только в файл.
 */
export async function convertAudio(data: Uint8Array, to: AudioTarget): Promise<{ data: Uint8Array; mime: string } | null> {
  const dir = await mkdtemp(join(tmpdir(), "mb-audio-"));
  try {
    const output = join(dir, `out.${to}`);
    if (!(await convertAudioToFile(data, to, output))) return null;
    return { data: new Uint8Array(await readFile(output)), mime: TARGETS[to].mime };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** То же, но результат — файл на диске (кэш: потом отдаётся потоком с Range, без повторной перекодировки). false — не вышло. */
export async function convertAudioToFile(data: Uint8Array, to: AudioTarget, outputPath: string): Promise<boolean> {
  const dir = await mkdtemp(join(tmpdir(), "mb-audio-in-"));
  try {
    const input = join(dir, "in.bin");
    await writeFile(input, data);
    await slot(() => run("ffmpeg", ["-y", "-v", "error", "-threads", "1", "-i", input, ...TARGETS[to].args, outputPath], { timeout: 30_000 }));
    return true;
  } catch {
    return false;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
