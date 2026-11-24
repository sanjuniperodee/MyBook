/**
 * Проверка, что разовые скрипты на сервере запускаются (только чтение): контейнер, база, sharp.
 * На сервере, из ~/mybook (docs/microservices/06-operations.md §2.8):
 *   SCHEDULER=off PDF_WORKER=off node_modules/.bin/tsx --env-file-if-exists=.env --import ./scripts/preload.mjs scripts/ops/check.ts
 */
import { container } from "@/server/container";
import { pool } from "@/shared/infrastructure/db";

const rows = await container().reporting.bookList("all", { staleDays: 14, now: Date.now(), viewer: { seesAll: true, userId: "" } as never });
const sharp = (await import("sharp")).default;
const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#fff" } }).png().toBuffer();
console.log("ops-check ok: книг", rows.length, "sharp", png.length, "байт");
await pool.end();
