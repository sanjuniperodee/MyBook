import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import baseline from "./legacy-ratchet.json";

// Храповик выноса старого слоя (docs/refactor/legacy-removal-plan.md, этап 0): числа только уменьшаются.
// Выросло — новый код пишется в src/modules и apps/backend, не в src/server. Уменьшилось — опустите порог в legacy-ratchet.json.

const ROOT = path.join(__dirname, "..");
const CODE = /\.(ts|tsx|mts|mjs)$/;
/** Общий код веба: с настоящим Next работает в mybook-web, в бэкенде не участвует. */
const WEB_ONLY = new Set(["src/i18n/client.tsx", "src/i18n/server.ts"]);

function walk(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  return readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) return walk(rel);
    return CODE.test(e.name) ? [rel] : [];
  });
}

const backendFiles = [...walk("src"), ...walk("apps")].filter((f) => !WEB_ONLY.has(f));
const text = new Map(backendFiles.map((f) => [f, readFileSync(path.join(ROOT, f), "utf8")]));
const importing = (re: RegExp) => backendFiles.filter((f) => re.test(text.get(f)!));

const metrics = {
  serverFiles: backendFiles.filter((f) => f.startsWith("src/server/")).length,
  serverImporters: importing(/(?:from\s+|import\()["']@\/server\//).filter((f) => !f.startsWith("src/server/")).length,
  nextImporters: importing(/(?:from\s+|import\()["']next\//).length,
  useServer: importing(/^\s*["']use server["'];?\s*$/m).length,
};

const TITLES: Record<keyof typeof metrics, string> = {
  serverFiles: "файлов в src/server",
  serverImporters: "файлов вне src/server с импортом @/server/*",
  nextImporters: "файлов бэкенда с импортом next/*",
  useServer: "файлов с \"use server\"",
};

describe("храповик старого слоя", () => {
  for (const key of Object.keys(metrics) as (keyof typeof metrics)[]) {
    it(`${TITLES[key]}: не больше порога`, () => {
      expect(metrics[key], `Стало больше, чем ${baseline[key]}: новый код — в src/modules / apps/backend`).toBeLessThanOrEqual(baseline[key]);
    });
    it(`${TITLES[key]}: порог опущен`, () => {
      expect(baseline[key], `Стало ${metrics[key]} — опустите ${key} в tests/legacy-ratchet.json`).toBe(metrics[key]);
    });
  }
});
