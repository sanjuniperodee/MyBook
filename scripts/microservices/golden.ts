/**
 * Golden DTO: снимает ответы ключевых read-моделей на детерминированном seed.
 *
 * Запуск:
 *   VISUAL_DATABASE_URL=postgres://…/mybook_visual npx tsx --import ./scripts/preload.mjs scripts/microservices/golden.ts
 *   … --check   # сравнить с коммитнутыми снимками, ничего не записывая
 *
 * Внутри: seed (тот же, что у визуальных тестов) → container() → normalize → JSON.
 * Снимки лежат в tests/microservices/golden и коммитятся.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { diffValues, normalize } from "@/shared/parity/normalize";

const ROOT = process.cwd();
const GOLDEN_DIR = path.join(ROOT, "tests/microservices/golden");
const SEED_FILE = path.join(ROOT, "tests/visual/.seed.json");
const CHECK = process.argv.includes("--check");
const DB_URL = process.env.VISUAL_DATABASE_URL ?? process.env.GOLDEN_DATABASE_URL;

interface Seed {
  adminId: string;
  clientId: string;
  bookId: string;
  orderId: string;
  dealId: string;
  conversationId: string;
  pipelineId: string;
  newStageId: string;
  paidStageId: string;
}

/** Секреты и хэши не должны попадать в golden-снимки. */
const SENSITIVE = new Set(["passwordHash", "totpSecret", "totpBackup", "apiKey", "secret", "password"]);
function stripSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSensitive);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !SENSITIVE.has(key))
        .map(([key, v]) => [key, stripSensitive(v)]),
    );
  }
  return value;
}

/** UUID в DTO — непрозрачные идентификаторы; для снимка заменяем известные роли на токены. */
function maskIds(value: unknown, ids: Map<string, string>): unknown {
  if (typeof value === "string") return ids.get(value.toLowerCase()) ?? (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? "<uuid>" : value);
  if (Array.isArray(value)) return value.map((v) => maskIds(v, ids));
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, maskIds(v, ids)]));
  }
  if (value instanceof Date) return value;
  return value;
}

async function main() {
  if (!DB_URL) throw new Error("Нужен VISUAL_DATABASE_URL (или GOLDEN_DATABASE_URL) тестовой базы");
  if (!/(test|visual)/i.test(DB_URL)) throw new Error(`Не похоже на тестовую базу: ${DB_URL}. Остановлено.`);

  // Тот же seed, что у скриншотов: фиксированные ID и даты.
  execFileSync("npx", ["tsx", "--import", "./scripts/preload.mjs", "scripts/visual/seed.ts"], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: "pipe",
    encoding: "utf8",
  });
  const seed = JSON.parse(readFileSync(SEED_FILE, "utf8")) as Seed;

  process.env.DATABASE_URL = DB_URL;
  process.env.APP_SECRET ??= "golden-test-secret-0123456789";
  process.env.STORAGE_DIR ??= "/tmp/mybook-visual-storage";
  process.env.SCHEDULER = "off";
  process.env.SKIP_AUTO_MIGRATE = "1";

  const { container } = await import("@/server/container");
  const c = container();
  const viewer = { userId: seed.adminId, seesAll: true };
  const ids = new Map(
    [
      [seed.adminId, "<admin>"],
      [seed.clientId, "<client>"],
      [seed.bookId, "<book>"],
      [seed.orderId, "<order>"],
      [seed.dealId, "<deal>"],
      [seed.conversationId, "<conversation>"],
      [seed.pipelineId, "<pipeline>"],
      [seed.newStageId, "<stage-new>"],
      [seed.paidStageId, "<stage-paid>"],
    ].map(([uuid, token]) => [uuid.toLowerCase(), token]),
  );

  const cases: Record<string, () => Promise<unknown>> = {
    "authoring-bundle": () => c.authoring.queries.bundle(seed.bookId),
    "authoring-user-books": () => c.authoring.queries.userBooks(seed.clientId),
    "ordering-order-details": () => c.ordering.queries.orderDetails(seed.orderId),
    "ordering-user-orders": () => c.ordering.queries.userOrders(seed.clientId),
    "reporting-deal-card": () => c.reporting.dealCard({ id: seed.dealId, clientId: seed.clientId, orderId: seed.orderId }, { calls: true, chats: true }),
    "reporting-client-card": () => c.reporting.clientCard(seed.clientId, { deals: true }),
    "reporting-inbox": () => c.reporting.inbox(viewer, "open", undefined),
    "messaging-conversation": () => c.messaging.queries.conversation(seed.conversationId),
  };

  mkdirSync(GOLDEN_DIR, { recursive: true });
  let mismatches = 0;
  for (const [name, load] of Object.entries(cases)) {
    const value = normalize(maskIds(stripSensitive(await load()), ids));
    const file = path.join(GOLDEN_DIR, `${name}.json`);
    if (CHECK) {
      if (!existsSync(file)) {
        console.error(`✗ ${name}: нет эталона ${path.relative(ROOT, file)}`);
        mismatches++;
        continue;
      }
      const expected = JSON.parse(readFileSync(file, "utf8")) as unknown;
      const diffs = diffValues(expected, value);
      if (diffs.length) {
        mismatches++;
        console.error(`✗ ${name}: ${diffs.length} отличий`);
        for (const d of diffs.slice(0, 10)) console.error(`  ${d.path}: ${JSON.stringify(d.inprocess)} → ${JSON.stringify(d.remote)}`);
      }
    } else {
      writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
    }
  }

  const { pool } = await import("@/shared/infrastructure/db");
  await pool.end();

  if (CHECK) {
    console.log(`golden: ${Object.keys(cases).length - mismatches} ok, ${mismatches} mismatch`);
    if (mismatches) process.exitCode = 1;
  } else {
    console.log(`golden: ${Object.keys(cases).length} снимков записано в ${path.relative(ROOT, GOLDEN_DIR)}`);
  }
}

main().catch(async (err) => {
  console.error(err);
  process.exitCode = 1;
});
