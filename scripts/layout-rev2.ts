// Перевод книг на правила раскладки фото 2 (books.layout_rev): npm run photos:layout-rev2                    — пробный проход: отчёт, ничего не пишет
//                                                               npm run photos:layout-rev2 -- --apply         — выполнить (сначала резервная копия)
//                                                               npm run photos:layout-rev2 -- --book=<id>     — одна книга
//                                                               npm run photos:layout-rev2 -- --limit=<n>     — не больше n книг
//                                                               npm run photos:layout-rev2 -- --restore=<файл> [--apply] [--force] — откат из копии
// Выпуск 1 — только пробный проход: --apply скрипт выполняет, лишь когда включён выпуск 2 (domain/layout-rev.ts) — сразу
// после его выкатки, в тихие часы. Неизвестный или пустой аргумент — ошибка (layout-rev2-args.ts), ничего не делается.
// Каждая книга на правилах 1 (черновики и заказанные) переводится своей транзакцией, только если напечатанное не меняется
// (план A или B, application/layout-rev2.ts); иначе остаётся на правилах 1 — с причиной в отчёте. Пишутся только
// photos.chapter, opener, position и books.layout_rev, без updated_at. Повторный запуск берёт только книги на правилах 1.
// До записи прежние значения каждой книги ложатся в $STORAGE_DIR/backups/layout-rev2-<время>.json — по нему --restore.
// Книги — пачками по 100 с паузой: сервер общий с DoseWear и my-test.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { container } from "../src/server/container";
import { env } from "@/config/env";
import { pool } from "@/shared/infrastructure/db";
import type { LayoutRevBackupBook } from "@/modules/authoring";
import { parseLayoutRev2Args } from "./layout-rev2-args";

const args = parseLayoutRev2Args(process.argv.slice(2));
if ("error" in args) {
  console.error(`${args.error}\nНичего не сделано. Аргументы: --apply, --book=<id>, --limit=<n>, --restore=<файл> [--force].`);
  process.exit(1);
}
const { apply } = args;
const BATCH = 100;
const PAUSE_MS = 2000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const service = container().authoring.layoutRev;

interface BackupFile {
  createdAt: string;
  books: LayoutRevBackupBook[];
}

async function restore(file: string, force: boolean) {
  let saved: BackupFile;
  try {
    saved = JSON.parse(readFileSync(file, "utf8")) as BackupFile;
  } catch (err) {
    console.error(`Резервная копия не читается (${file}): ${err instanceof Error ? err.message : err}. Ничего не сделано.`);
    process.exitCode = 1;
    return;
  }
  const tally = { restored: 0, changed: 0, missing: 0, notMigrated: 0, failed: 0 };
  for (const book of saved.books) {
    try {
      const r = await service.restore(book, { apply, force });
      tally[r]++;
      if (r !== "restored")
        console.log(
          `  ${book.id}: ${r === "changed" ? "книгу правили после перевода, откат изменил бы напечатанное — пропущена (--force, чтобы откатить всё равно)" : r === "missing" ? "книги больше нет" : "книга уже не на правилах 2"}`,
        );
    } catch (err) {
      tally.failed++;
      console.error(`  ✗ ${book.id}: ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`${apply ? "Откачено" : "Будет откачено"}: ${tally.restored} из ${saved.books.length}; правили после перевода — ${tally.changed}, нет книги — ${tally.missing}, не на правилах 2 — ${tally.notMigrated}, ошибок — ${tally.failed}.`);
  if (!apply) console.log("Пробный проход. Запустите с --apply, чтобы откатить.");
  if (tally.failed) process.exitCode = 1;
}

async function migrate(limit: number, only: string | null) {
  if (apply && !service.applyOpen) {
    console.error("Выпуск 1: перевод с записью выключен — переведённые книги жили бы по правилам 2 под интерфейсом выпуска 1. --apply — сразу после выкатки выпуска 2 (domain/layout-rev.ts). Ничего не записано.");
    process.exitCode = 1;
    return;
  }
  // В выпуске 1 их нет вовсе (ставит только интерфейс выпуска 2); потом это выбор авторов — правила 1 и перевод его учитывают.
  console.log(`Фото на служебных ключах мест (альбом, «не печатается») у книг на правилах 1: ${await service.reservedKeyCount()}`);

  // Резервная копия: файл переписывается целиком до записи каждой книги (через временный файл — без обрывков).
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(env.storageDir, "backups", `layout-rev2-${stamp}.json`);
  const backup: BackupFile = { createdAt: new Date().toISOString(), books: [] };
  const save = (rows: LayoutRevBackupBook) => {
    if (!backup.books.length) mkdirSync(path.dirname(backupFile), { recursive: true });
    backup.books.push(rows);
    writeFileSync(`${backupFile}.tmp`, JSON.stringify(backup));
    renameSync(`${backupFile}.tmp`, backupFile);
  };

  const tally = { scanned: 0, A: 0, B: 0, coverDrafts: 0, stayed: 0, done: 0, missing: 0, failed: 0 };
  const stayed: Record<string, number> = {};
  let after: string | null = null;
  for (;;) {
    const room = limit - tally.scanned;
    if (room <= 0) break;
    const ids: string[] = only ? (after ? [] : [only]) : await service.pending(Math.min(BATCH, room), after);
    if (!ids.length) break;
    for (const id of ids) {
      tally.scanned++;
      try {
        const r = await service.migrate(id, { apply, backup: save });
        if ("skipped" in r) {
          tally[r.skipped]++;
          if (only) console.log(r.skipped === "done" ? "Книга уже на правилах 2." : "Книги нет.");
          continue;
        }
        const label = `${id} «${r.title}»${r.status === "ordered" ? " (заказана)" : ""}`;
        if (r.plan.ok) {
          tally[r.plan.plan]++;
          const what = r.plan.plan === "B" ? `план B, позиции фото перенумерованы (${r.plan.changes.length} фото)` : `план A (${r.plan.changes.length} фото)`;
          if (r.plan.coverInAnswer) {
            // Черновик со снимком обложки в ответе: переводится, и снимок теперь печатается в ответе (редактор его там показывает).
            tally.coverDrafts++;
            console.log(`${label}: ${what}; фото обложки теперь видно в ответе «${r.plan.coverInAnswer.heading || "без заголовка"}»`);
          } else if (r.plan.plan === "B" || only) console.log(`${label}: ${what}`);
        } else {
          tally.stayed++;
          stayed[r.plan.reason] = (stayed[r.plan.reason] ?? 0) + 1;
          const why =
            r.plan.reason === "coverInAnswer"
              ? `книга заказана, а фото обложки стоит в ответе «${r.plan.coverInAnswer?.heading || "без заголовка"}» — по правилам 2 оно там напечаталось бы`
              : "правила 2 не повторяют вёрстку";
          console.log(`${label}: остаётся на правилах 1 — ${why}`);
        }
      } catch (err) {
        tally.failed++;
        console.error(`  ✗ ${id}: ${err instanceof Error ? err.message : err}`);
      }
    }
    after = ids[ids.length - 1];
    if (!only && ids.length === Math.min(BATCH, room)) await sleep(PAUSE_MS);
  }

  const reasons = Object.entries(stayed)
    .map(([k, n]) => `${k} — ${n}`)
    .join(", ");
  console.log(
    [
      `Просмотрено книг на правилах 1: ${tally.scanned}`,
      `${apply ? "Переведено" : "Можно перевести"}: план A — ${tally.A}, план B (позиции перенумерованы) — ${tally.B}`,
      `Из них черновиков, где фото обложки теперь видно в ответе: ${tally.coverDrafts}`,
      `Остаются на правилах 1: ${tally.stayed}${reasons ? ` (${reasons})` : ""}`,
      ...(tally.done || tally.missing ? [`Уже на правилах 2: ${tally.done}, нет книги: ${tally.missing}`] : []),
      ...(tally.failed ? [`Ошибок: ${tally.failed}`] : []),
      apply ? (backup.books.length ? `Резервная копия: ${backupFile}` : "Записывать было нечего.") : service.applyOpen ? "Пробный проход. Запустите с --apply, чтобы выполнить." : "Пробный проход (выпуск 1: --apply — после выкатки выпуска 2).",
    ].join("\n"),
  );
  if (tally.failed) process.exitCode = 1;
}

await (args.mode === "restore" ? restore(args.file, args.force) : migrate(args.limit, args.book));
await pool.end();
