import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Хранилище с S3: файлы только в бакете, диск — временное место для программ. Бакет подменён памятью: запись уходит
 * только в бакет, чтение — из бакета, файл с переезда при чтении переезжает в бакет, кэш остаётся на диске.
 */
const bucket = new Map<string, { data: Buffer; modifiedMs: number }>();

vi.mock("@/shared/infrastructure/s3", () => ({
  createS3: (cfg: { prefix: string }) => ({
    config: cfg,
    put: async (key: string, data: Buffer) => void bucket.set(cfg.prefix + key, { data: Buffer.from(data), modifiedMs: Date.now() }),
    putFile: async (key: string, file: string) => void bucket.set(cfg.prefix + key, { data: readFileSync(file), modifiedMs: Date.now() }),
    get: async (key: string) => bucket.get(cfg.prefix + key)?.data ?? null,
    download: async (key: string, file: string) => {
      const o = bucket.get(cfg.prefix + key);
      if (!o) return false;
      const { mkdirSync } = await import("node:fs");
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, o.data);
      return true;
    },
    exists: async (key: string) => bucket.has(cfg.prefix + key),
    // Как отвечает бакет на GET с Range / If-None-Match (один диапазон, ETag — от содержимого).
    open: async (key: string, headers: Record<string, string> = {}) => {
      const o = bucket.get(cfg.prefix + key);
      if (!o) return new Response("<Error><Code>NoSuchKey</Code></Error>", { status: 404 });
      const etag = `"etag-${o.data.length}"`;
      const size = o.data.length;
      if (headers["if-none-match"] === etag) return new Response(null, { status: 304, headers: { etag } });
      const m = headers.range ? /^bytes=(\d*)-(\d*)$/.exec(headers.range) : null;
      if (m) {
        const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
        const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
        if (start >= size) return new Response("<Error/>", { status: 416, headers: { "content-range": `bytes */${size}` } });
        const part = o.data.subarray(start, end + 1);
        return new Response(new Uint8Array(part), { status: 206, headers: { etag, "content-length": String(part.length), "content-range": `bytes ${start}-${end}/${size}` } });
      }
      return new Response(new Uint8Array(o.data), { status: 200, headers: { etag, "content-length": String(size) } });
    },
    delete: async (key: string) => void bucket.delete(cfg.prefix + key),
    list: async (prefix: string) =>
      [...bucket]
        .filter(([k]) => k.startsWith(cfg.prefix + prefix))
        .map(([k, o]) => ({ key: k.slice(cfg.prefix.length), size: o.data.length, modifiedMs: o.modifiedMs })),
  }),
}));

const dir = mkdtempSync(path.join(os.tmpdir(), "storage-s3-"));
let storage: typeof import("@/shared/infrastructure/storage");

beforeAll(async () => {
  vi.stubEnv("STORAGE_DIR", dir);
  vi.stubEnv("S3_BUCKET", "test");
  vi.stubEnv("S3_ACCESS_KEY_ID", "id");
  vi.stubEnv("S3_SECRET_ACCESS_KEY", "secret");
  vi.stubEnv("S3_PREFIX", "mybooks/");
  vi.resetModules();
  storage = await import("@/shared/infrastructure/storage");
});
afterAll(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => bucket.clear());

describe("хранилище с S3", () => {
  it("запись уходит только в бакет под префиксом проекта, на диске файла нет", async () => {
    await storage.putFile("photos/b1/p1.jpg", Buffer.from("jpg"));
    expect(bucket.get("mybooks/photos/b1/p1.jpg")?.data.toString()).toBe("jpg");
    expect(existsSync(path.join(dir, "photos/b1/p1.jpg"))).toBe(false);
  });

  it("запись убирает устаревшую копию на диске", async () => {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(path.join(dir, "photos/b1"), { recursive: true });
    writeFileSync(path.join(dir, "photos/b1/p2.jpg"), "old");
    await storage.putFile("photos/b1/p2.jpg", Buffer.from("new"));
    expect(existsSync(path.join(dir, "photos/b1/p2.jpg"))).toBe(false);
    expect((await storage.getFile("photos/b1/p2.jpg")).toString()).toBe("new");
  });

  it("чтение — из бакета, без копии на диске", async () => {
    bucket.set("mybooks/orders/o1/block.pdf", { data: Buffer.from("pdf"), modifiedMs: 1 });
    expect((await storage.getFile("orders/o1/block.pdf")).toString()).toBe("pdf");
    expect(existsSync(path.join(dir, "orders/o1/block.pdf"))).toBe(false);
    expect(await storage.fileExists("orders/o1/block.pdf")).toBe(true);
  });

  it("файл с переезда, которого нет в бакете, при чтении выкладывается в бакет", async () => {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(path.join(dir, "receipts"), { recursive: true });
    writeFileSync(path.join(dir, "receipts/r1.pdf"), "legacy");
    expect(await storage.fileExists("receipts/r1.pdf")).toBe(true);
    expect((await storage.getFile("receipts/r1.pdf")).toString()).toBe("legacy");
    expect(bucket.get("mybooks/receipts/r1.pdf")?.data.toString()).toBe("legacy");
  });

  it("файла нет нигде — ошибка ENOENT, как без S3", async () => {
    await expect(storage.getFile("photos/none.jpg")).rejects.toMatchObject({ code: "ENOENT" });
    expect(await storage.fileExists("photos/none.jpg")).toBe(false);
    expect(await storage.localPath("photos/none.jpg")).toBeNull();
  });

  it("localPath скачивает файл для программ, которым нужен путь", async () => {
    bucket.set("mybooks/answer-media/b1/f1/media.mp4", { data: Buffer.from("mp4"), modifiedMs: 1 });
    const p = await storage.localPath("answer-media/b1/f1/media.mp4");
    expect(p).toBe(path.join(dir, "answer-media/b1/f1/media.mp4"));
    expect(readFileSync(p!, "utf8")).toBe("mp4");
  });

  it("publish выкладывает записанное по пути", async () => {
    const p = storage.storagePath("call-recordings/c1/call.m4a");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, "m4a");
    await storage.publish("call-recordings/c1/call.m4a");
    expect(bucket.get("mybooks/call-recordings/c1/call.m4a")?.data.toString()).toBe("m4a");
  });

  it("пересобираемый кэш живёт только на диске", async () => {
    await storage.putFile("cache/preview/b1/x.pdf", Buffer.from("x"));
    await storage.putFile("chat-audio-cache/m1.m4a", Buffer.from("a"));
    expect(bucket.size).toBe(0);
    expect(await storage.fileExists("cache/preview/b1/x.pdf")).toBe(true);
  });

  it("удаление чистит и диск, и бакет; по префиксу — всё внутри", async () => {
    await storage.putFile("answer-media/b2/f1/media.m4a", Buffer.from("1"));
    await storage.putFile("answer-media/b2/f1/poster.jpg", Buffer.from("2"));
    await storage.putFile("answer-media/b2/f2/media.m4a", Buffer.from("3"));
    await storage.deletePrefix("answer-media/b2/f1");
    expect([...bucket.keys()]).toEqual(["mybooks/answer-media/b2/f2/media.m4a"]);
    expect(existsSync(path.join(dir, "answer-media/b2/f1"))).toBe(false);
    await storage.deleteFile("answer-media/b2/f2/media.m4a");
    expect(bucket.size).toBe(0);
  });

  it("список папки — файлы и вложенные папки по бакету", async () => {
    bucket.set("mybooks/call-recordings/c2/parts/000001.webm", { data: Buffer.from("a"), modifiedMs: 5 });
    bucket.set("mybooks/call-recordings/c2/parts/000002.webm", { data: Buffer.from("b"), modifiedMs: 7 });
    bucket.set("mybooks/call-recordings/c2/call.m4a", { data: Buffer.from("c"), modifiedMs: 9 });
    expect((await storage.listFiles("call-recordings/c2/parts")).map((f) => f.name).sort()).toEqual(["000001.webm", "000002.webm"]);
    expect((await storage.listFiles("call-recordings/c2")).sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      { name: "call.m4a", modifiedMs: 9 },
      { name: "parts", modifiedMs: 7 },
    ]);
  });

  it("ключ за пределами хранилища отклоняется", async () => {
    await expect(storage.putFile("../escape.txt", "x")).rejects.toThrow("Invalid storage key");
  });

  it("отдача потоком: из бакета с тем же Range и ETag, без копии на диске", async () => {
    await storage.putFile("answer-media/b/f/media.mp4", "0123456789");
    const full = await storage.openStoredFile("answer-media/b/f/media.mp4");
    expect(full).toMatchObject({ status: 200, size: 10, contentLength: 10, etag: '"etag-10"' });
    expect(await new Response(full!.body).text()).toBe("0123456789");
    const part = await storage.openStoredFile("answer-media/b/f/media.mp4", { range: "bytes=2-4" });
    expect(part).toMatchObject({ status: 206, size: 10, contentLength: 3, contentRange: "bytes 2-4/10" });
    expect(await new Response(part!.body).text()).toBe("234");
    expect(await storage.openStoredFile("answer-media/b/f/media.mp4", { ifNoneMatch: '"etag-10"' })).toMatchObject({ status: 304, body: null });
    // Список диапазонов и мусор — как без Range.
    expect(await storage.openStoredFile("answer-media/b/f/media.mp4", { range: "bytes=0-1,4-5" })).toMatchObject({ status: 200, contentLength: 10 });
    expect(existsSync(path.join(dir, "answer-media/b/f/media.mp4"))).toBe(false);
    expect(await storage.openStoredFile("answer-media/b/f/none.mp4")).toBeNull();
  });

  it("отдача потоком файла с переезда, которого нет в бакете, — с диска с Range и ETag как у serveFile", async () => {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(path.join(dir, "support/t1"), { recursive: true });
    writeFileSync(path.join(dir, "support/t1/a.ogg"), "abcdefghij");
    const part = await storage.openStoredFile("support/t1/a.ogg", { range: "bytes=-3" });
    expect(part).toMatchObject({ status: 206, contentLength: 3, contentRange: "bytes 7-9/10" });
    expect(await new Response(part!.body).text()).toBe("hij");
    const full = await storage.openStoredFile("support/t1/a.ogg");
    expect(full!.etag).toMatch(/^"a-[0-9a-f]+"$/);
    expect(await storage.openStoredFile("support/t1/a.ogg", { ifNoneMatch: full!.etag })).toMatchObject({ status: 304 });
    expect(await storage.openStoredFile("support/t1/a.ogg", { range: "bytes=50-" })).toMatchObject({ status: 416, contentRange: "bytes */10" });
    await full!.body!.cancel();
  });
});
