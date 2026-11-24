import { describe, expect, it } from "vitest";
import { asciiSource } from "../scripts/ascii-bundle.mjs";

// G4: бандлы воркеров — чистый ASCII, чтобы V8 держал исходник однобайтной строкой; смысл кода тот же.
const run = (code: string) => new Function(`${code}; return out;`)() as unknown;

describe("asciiSource", () => {
  it("регулярные выражения (с u и без, «\\…»), имена и sql`…` — без не-ASCII и с тем же результатом", () => {
    const src = [
      "const sql = (s, ...v) => s.join('?');",
      "const ёж = 1;",
      "const re = /[,.;:!?…—)»]$/u, re2 = /^[«\"„“]/, re3 = /\\…/, re4 = /[😀]/u;",
      "const out = [re.test('да…'), re.test('нет'), re2.test('«а'), re3.test('…'), re4.test('😀'), ёж, sql`select 'не указан' -- коммент ${1} и ещё`];",
    ].join("\n");
    const { code, left } = asciiSource(src);
    expect(code).not.toMatch(/[^\x00-\x7f]/);
    expect(left).toBe(0);
    expect(run(code)).toEqual(run(src));
  });

  it("String.raw и другие теги не трогает: у них экранирование меняет значение", () => {
    const src = "const out = String.raw`ж${1}ё`;";
    const { code, left } = asciiSource(src);
    expect(code).toBe(src);
    expect(left).toBe(2);
  });

  it("вложенные шаблоны и { } в подстановке: тег берётся свой", () => {
    const src = "const sql = (s) => s.join('|'); const out = sql`а${({ x: String.raw`б` }).x}в`;";
    const { code, left } = asciiSource(src);
    expect(left).toBe(1);
    expect(run(code)).toBe(run(src));
  });
});
