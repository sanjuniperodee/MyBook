import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { serveFile } from "@/server/range-file";

const dir = mkdtempSync(join(tmpdir(), "range-file-"));
const file = join(dir, "voice.m4a");
writeFileSync(file, Buffer.from("0123456789"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const get = (headers: Record<string, string> = {}) => serveFile(file, "audio/mp4", new Request("http://x/a", { headers }));

describe("serveFile", () => {
  it("без Range отдаёт файл целиком и ETag", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(await res.text()).toBe("0123456789");
  });

  it("Range — 206 с нужным куском, в том числе открытый и суффиксный", async () => {
    const part = await get({ Range: "bytes=2-4" });
    expect(part.status).toBe(206);
    expect(part.headers.get("Content-Range")).toBe("bytes 2-4/10");
    expect(await part.text()).toBe("234");
    const open = await get({ Range: "bytes=7-" });
    expect(await open.text()).toBe("789");
    const tail = await get({ Range: "bytes=-3" });
    expect(await tail.text()).toBe("789");
  });

  it("Range за концом файла — 416", async () => {
    expect((await get({ Range: "bytes=50-60" })).status).toBe(416);
  });

  it("повторный запрос с тем же ETag — 304 без тела", async () => {
    const etag = (await get()).headers.get("ETag")!;
    const res = await get({ "If-None-Match": etag });
    expect(res.status).toBe(304);
    expect(await res.text()).toBe("");
  });
});
