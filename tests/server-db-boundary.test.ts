import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- конфиг ESLint без типов
import { serverDbLegacy, serverDbRoots } from "../eslint.config.mjs";

// Храповик правила «src/server не ходит в БД» (eslint.config.mjs, ADR 0009 P2): исключения только убывают.
const DB_IMPORT = /^import (?!type )[^;]*from "(drizzle-orm[^"]*|pg|@\/shared\/infrastructure\/(db|database)[^"]*)"/m;

describe("src/server и БД", () => {
  const root = path.join(__dirname, "..");
  for (const file of [...(serverDbLegacy as string[]), ...(serverDbRoots as string[])]) {
    it(`${file}: исключение ещё нужно`, () => {
      const p = path.join(root, file);
      expect(existsSync(p), `${file} удалён — уберите его из eslint.config.mjs`).toBe(true);
      expect(DB_IMPORT.test(readFileSync(p, "utf8")), `${file} больше не ходит в БД — уберите его из списка в eslint.config.mjs`).toBe(true);
    });
  }
  it("исключений нет: все запросы к БД — в модулях", () => {
    expect((serverDbLegacy as string[]).length).toBe(0);
  });
});
