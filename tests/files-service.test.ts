import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fileTokenExpiry, filesMode, filesSigningKey, resetFilesServiceState, signFileToken, viaFilesService } from "@/server/files-service";

// Пилот G3: сайт выдаёт подписанные ссылки Go-сервису mybook-files (services/files) и переключается флагом без выкатки.

const dir = mkdtempSync(path.join(os.tmpdir(), "files-service-"));
const flags = path.join(dir, "flags");
mkdirSync(flags);
let service: Server;
let seen: { url: string; range?: string } | null = null;
let alive = true;

beforeAll(async () => {
  // Поддельный mybook-files: /healthz и файл с теми же заголовками, что отдаёт сервис.
  service = createServer((req, res) => {
    if (!alive) return res.destroy();
    if (req.url === "/healthz") return res.end("ok\n");
    seen = { url: req.url!, range: req.headers.range };
    const payload = JSON.parse(Buffer.from(req.url!.split("/")[2].split(".")[0], "base64url").toString()) as { k: string };
    if (payload.k.includes("missing")) return res.writeHead(404).end("404 page not found");
    res.writeHead(req.headers.range ? 206 : 200, {
      "Content-Type": "video/mp4",
      "Content-Length": "3",
      ...(req.headers.range ? { "Content-Range": "bytes 0-2/10" } : {}),
      "Accept-Ranges": "bytes",
      ETag: '"md5"',
      "Cache-Control": "public, max-age=604800",
      "X-Frame-Options": "SAMEORIGIN",
      "Set-Cookie": "leak=1",
    });
    res.end("abc");
  });
  await new Promise<void>((r) => service.listen(0, "127.0.0.1", r));
  vi.stubEnv("FILES_PORT", String((service.address() as AddressInfo).port));
  vi.stubEnv("MYBOOK_FLAGS_DIR", flags);
  vi.stubEnv("APP_SECRET", "test-secret-0123456789");
});
afterAll(() => {
  vi.unstubAllEnvs();
  service.close();
  rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => {
  resetFilesServiceState();
  rmSync(path.join(flags, "files-service"), { force: true });
  vi.stubEnv("FILES_SERVICE", "");
  seen = null;
  alive = true;
});

const setFlag = (mode: string) => {
  const f = path.join(flags, "files-service");
  writeFileSync(f, `${mode}\n`);
  // Новое время изменения — чтобы флаг перечитался, даже если запись в ту же секунду.
  const t = Date.now() / 1000 + Math.random();
  utimesSync(f, t, t);
};

describe("подпись ссылки", () => {
  it("тот же вектор, что проверяет services/files (TestTokenFromSite)", () => {
    const token = signFileToken({ key: "photos/b1/p1.jpg", type: "image/jpeg", expires: 1_800_000_060, headers: { "Cache-Control": "private, no-cache" } }, filesSigningKey("test-secret-0123456789"));
    const goTest = readFileSync("services/files/files_test.go", "utf8");
    expect(goTest).toContain(`const site = "${token}"`);
  });
});

describe("режим и откат без выкатки", () => {
  it("по умолчанию off; FILES_SERVICE включает; файл-флаг главнее; мусор — off", async () => {
    expect(await filesMode()).toBe("off");
    vi.stubEnv("FILES_SERVICE", "proxy");
    resetFilesServiceState();
    expect(await filesMode()).toBe("proxy");
    setFlag("off");
    resetFilesServiceState();
    expect(await filesMode()).toBe("off");
    setFlag("redirect");
    resetFilesServiceState();
    expect(await filesMode()).toBe("redirect");
    setFlag("bogus");
    resetFilesServiceState();
    expect(await filesMode()).toBe("proxy");
  });

  it("off — сайт отдаёт сам (null), к сервису не ходит", async () => {
    expect(await viaFilesService("answer-media/b/f/media.mp4", "video/mp4", new Request("http://x/api/v/t"))).toBeNull();
    expect(seen).toBeNull();
  });

  it("proxy — поток от сервиса с Range; чужие заголовки (Set-Cookie, общие заголовки сайта) не проходят", async () => {
    setFlag("proxy");
    const res = await viaFilesService("answer-media/b/f/media.mp4", "video/mp4", new Request("http://x/api/v/t", { headers: { Range: "bytes=0-2" } }), { "Cache-Control": "public, max-age=604800" });
    expect(res!.status).toBe(206);
    expect(await res!.text()).toBe("abc");
    expect(Object.fromEntries(res!.headers)).toEqual({ "content-type": "video/mp4", "content-length": "3", "content-range": "bytes 0-2/10", "accept-ranges": "bytes", etag: '"md5"', "cache-control": "public, max-age=604800" });
    expect(seen!.range).toBe("bytes=0-2");
    expect(seen!.url).toMatch(/^\/files\/[\w-]+\.[\w-]+$/);
  });

  it("redirect — 302 на /files/<ссылка> того же домена, без кэша", async () => {
    setFlag("redirect");
    const res = await viaFilesService("photos/b/p.jpg", "image/jpeg", new Request("http://x/api/photos/1"));
    expect(res!.status).toBe(302);
    expect(res!.headers.get("location")).toMatch(/^\/files\/[\w-]+\.[\w-]+$/);
    expect(res!.headers.get("cache-control")).toBe("private, no-store");
    // Тот же файл в пределах часа — та же ссылка: браузер кэширует по адресу и переспрашивает с If-None-Match.
    const again = await viaFilesService("photos/b/p.jpg", "image/jpeg", new Request("http://x/api/photos/1"));
    expect(again!.headers.get("location")).toBe(res!.headers.get("location"));
  });

  it("redirect — маршрут со своим ETag (фото) остаётся через сайт: 304 по своему адресу, без лишнего 302", async () => {
    setFlag("redirect");
    const res = await viaFilesService("photos/b/p.jpg", "image/jpeg", new Request("http://x/api/photos/1"), { ETag: '"route"', "Cache-Control": "private, no-cache" });
    expect(res!.status).toBe(200);
    expect(await res!.text()).toBe("abc");
  });

  it("срок ссылки — от 5 до 6 ч, одинаковый внутри часа", () => {
    const t = Date.UTC(2026, 10, 24, 10, 0, 0);
    expect(fileTokenExpiry(t)).toBe(fileTokenExpiry(t + 59 * 60 * 1000));
    expect(fileTokenExpiry(t + 60 * 60 * 1000)).toBe(fileTokenExpiry(t) + 3600);
    for (const ms of [t, t + 59 * 60 * 1000]) {
      const left = fileTokenExpiry(ms) - ms / 1000;
      expect(left).toBeGreaterThan(5 * 3600 - 1);
      expect(left).toBeLessThanOrEqual(6 * 3600);
    }
  });

  it("сервис не отвечает или файла у него нет — сайт отдаёт сам", async () => {
    setFlag("proxy");
    expect(await viaFilesService("support/t/missing.ogg", "audio/ogg", new Request("http://x/a"))).toBeNull();
    alive = false;
    resetFilesServiceState();
    setFlag("proxy");
    expect(await viaFilesService("support/t/a.ogg", "audio/ogg", new Request("http://x/a"))).toBeNull();
  });
});

