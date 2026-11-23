import { lstatSync, mkdirSync, mkdtempSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// Склейка копий серверных чанков Turbopack (G2, scripts/dedupe-server-chunks.mjs): −120 МБ памяти сайта по замеру 24.11.

const dir = mkdtempSync(path.join(os.tmpdir(), "dedupe-chunks-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("склейка копий серверных чанков", () => {
  it("копии, отличающиеся только картой исходников, становятся ссылками; require грузит файл один раз", async () => {
    const { dedupeChunks } = await import("../scripts/dedupe-server-chunks.mjs");
    const root = path.join(dir, "server");
    mkdirSync(path.join(root, "chunks", "ssr"), { recursive: true });
    const body = `module.exports=[1,(t)=>{t.v=${JSON.stringify("ж".repeat(5000))}}];`;
    writeFileSync(path.join(root, "chunks", "b.js"), `${body}\n\n//# sourceMappingURL=b.js.map`);
    writeFileSync(path.join(root, "chunks", "a.js"), `${body}\n\n//# sourceMappingURL=a.js.map`);
    writeFileSync(path.join(root, "chunks", "c.js"), `${body}/* другое */\n//# sourceMappingURL=c.js.map`);
    // В другой папке — свой __dirname и свои относительные require: не склеивается.
    writeFileSync(path.join(root, "chunks", "ssr", "d.js"), `${body}\n//# sourceMappingURL=d.js.map`);
    writeFileSync(path.join(root, "chunks", "small.js"), "module.exports=[]");
    writeFileSync(path.join(root, "chunks", "small2.js"), "module.exports=[]");

    expect(dedupeChunks(root)).toMatchObject({ files: 1 });
    expect(lstatSync(path.join(root, "chunks", "b.js")).isSymbolicLink()).toBe(true);
    expect(readlinkSync(path.join(root, "chunks", "b.js"))).toBe("a.js");
    for (const f of ["a.js", "c.js", "ssr/d.js", "small2.js"]) expect(lstatSync(path.join(root, "chunks", f)).isSymbolicLink()).toBe(false);

    const req = createRequire(path.join(root, "x.js"));
    expect(req(path.join(root, "chunks", "b.js"))).toBe(req(path.join(root, "chunks", "a.js")));
    // Повторный запуск ничего не меняет.
    expect(dedupeChunks(root)).toMatchObject({ files: 0 });
  });
});
