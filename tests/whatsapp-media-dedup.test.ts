import { mkdtemp, mkdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MediaDedup } from "@/modules/messaging";

/** Каталог вложений шлюза во временной папке; файлы «старые» (mtime — час назад), как после скачивания шлюзом. */
let dir: string;
const OLD = new Date(Date.now() - 3_600_000);

async function put(name: string, content: string | Buffer, at: Date = OLD) {
  const p = path.join(dir, name);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, content);
  await utimes(p, at, at);
  return p;
}

const ino = async (p: string) => (await stat(p)).ino;
const big = (fill: string) => Buffer.alloc(4096, fill);

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "gowa-media-"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe("MediaDedup", () => {
  it("одинаковые файлы становятся ссылками на один, разные того же размера — нет", async () => {
    const a = await put("1-a.jfif", big("x"));
    const b = await put("2-b.jfif", big("x"));
    const c = await put("3-c.jfif", big("y")); // тот же размер, другое содержимое
    const nested = await put("7700/2026-11-07/4-d.jfif", big("x"));
    const r = await new MediaDedup(dir).sweep();
    expect(r).toEqual({ files: 4, linked: 2, freed: 4096 * 2 });
    expect(await ino(b)).toBe(await ino(a));
    expect(await ino(nested)).toBe(await ino(a));
    expect(await ino(c)).not.toBe(await ino(a));
    expect((await readFile(b)).equals(big("x"))).toBe(true);
    expect((await readFile(c)).equals(big("y"))).toBe(true);
  });

  it("повторный проход ничего не трогает, свежий файл ждёт, пока шлюз его допишет", async () => {
    const a = await put("1-a.jfif", big("x"));
    const fresh = await put("2-b.jfif", big("x"), new Date());
    const d = new MediaDedup(dir);
    expect((await d.sweep()).linked).toBe(0);
    expect(await ino(fresh)).not.toBe(await ino(a));
    await utimes(fresh, OLD, OLD);
    expect((await d.sweep()).linked).toBe(1);
    expect(await ino(fresh)).toBe(await ino(a));
    expect(await d.sweep()).toEqual({ files: 2, linked: 0, freed: 0 });
  });

  it("мелкие файлы не считаются; оставляется файл, на который ссылок уже больше", async () => {
    await put("1-a.oga", "tiny");
    await put("2-b.oga", "tiny");
    const d = new MediaDedup(dir, { minSize: 1024 });
    expect((await d.sweep()).linked).toBe(0);
    const a = await put("3-a.pdf", big("z"));
    const b = await put("4-b.pdf", big("z"));
    expect((await d.sweep()).linked).toBe(1);
    const older = await put("0-older.pdf", big("z"), new Date(OLD.getTime() - 3_600_000));
    expect((await d.sweep()).linked).toBe(1);
    // Более старый одиночный файл присоединился к паре, а не наоборот.
    expect(await ino(older)).toBe(await ino(a));
    expect(await ino(b)).toBe(await ino(a));
  });

  it("брошенная временная ссылка удаляется, файл в процессе замены — нет", async () => {
    const stale = await put("1-a.jfif.dedup-tmp", big("x"));
    const live = await put("2-b.jfif.dedup-tmp", big("x"), new Date());
    await new MediaDedup(dir).sweep();
    await expect(stat(stale)).rejects.toThrow();
    await expect(stat(live)).resolves.toBeTruthy();
  });
});
