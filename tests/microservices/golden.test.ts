import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * Golden DTO: снимки read-моделей на детерминированном seed.
 * Запускается только когда явно задана тестовая БД (VISUAL_DATABASE_URL);
 * иначе пропускается, чтобы обычный `npm test` не трогал Postgres.
 */
const db = process.env.VISUAL_DATABASE_URL;
const run = db ? describe : describe.skip;

run("golden DTO", () => {
  it(
    "ключевые read-модели совпадают с закоммиченными снимками",
    () => {
      try {
        const out = execFileSync("npx", ["tsx", "--import", "./scripts/preload.mjs", "scripts/microservices/golden.ts", "--check"], {
          cwd: process.cwd(),
          env: { ...process.env, VISUAL_DATABASE_URL: db },
          encoding: "utf8",
          timeout: 90_000,
        });
        expect(out).toContain("golden: 8 ok, 0 mismatch");
      } catch (err) {
        const e = err as { stdout?: string; stderr?: string };
        throw new Error(`${e.stdout ?? ""}\n${e.stderr ?? ""}\n${String(err)}`);
      }
    },
    120_000,
  );
});
