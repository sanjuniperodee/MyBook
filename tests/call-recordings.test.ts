import { afterAll, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** Записи разговоров WhatsApp на диске: куски из браузера → склейка → m4a (нужен ffmpeg, без него тест пропускается). */
const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const dir = mkdtempSync(path.join(os.tmpdir(), "call-rec-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe.skipIf(!hasFfmpeg)("записи разговоров WhatsApp", () => {
  it("куски WebM по порядку → один m4a нужной длины; новый кусок после склейки — файл собирается заново", async () => {
    vi.stubEnv("STORAGE_DIR", dir);
    vi.resetModules();
    const { localCallRecordings } = await import("@/modules/telephony/infrastructure/recordings");
    const src = path.join(dir, "src.webm");
    execFileSync("ffmpeg", ["-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-c:a", "libopus", "-b:a", "32k", src]);
    const bytes = readFileSync(src);
    const id = "4f6c2a7e-1b2c-4d5e-8f90-123456789abc";
    const third = Math.ceil(bytes.length / 3);
    // Куски MediaRecorder — части одного потока: режем байты как есть.
    for (let i = 0; i < 3; i++) await localCallRecordings.append(id, i, "audio/webm", bytes.subarray(i * third, (i + 1) * third));
    const file = await localCallRecordings.file(id);
    expect(file?.mime).toBe("audio/mp4");
    const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file!.path]).toString());
    expect(duration).toBeGreaterThan(2.8);
    expect(duration).toBeLessThan(3.3);
    expect(statSync(file!.path).size).toBeGreaterThan(1000);
    await localCallRecordings.append(id, 3, "audio/webm", new Uint8Array(0));
    expect(() => statSync(file!.path)).toThrow();
    await expect(localCallRecordings.append("../../etc", 0, "audio/webm", new Uint8Array(1))).rejects.toThrow();
    await expect(localCallRecordings.append(id, 0, "audio/x-evil", new Uint8Array(1))).rejects.toThrow();
    expect(await localCallRecordings.file("5f6c2a7e-1b2c-4d5e-8f90-123456789abc")).toBeNull();
  });
});
