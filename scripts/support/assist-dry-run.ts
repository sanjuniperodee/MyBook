/**
 * Что предложил бы помощник по прошлым обращениям — без записи и без правок (проверка на эталонах, 28.11.2026):
 *   tsx --import ./scripts/preload.mjs scripts/support/assist-dry-run.ts 1 2 9 15
 * Заказанные книги считаются открытыми для правок (pretendOpen), иначе виден только ответ «книга заказана».
 * Книги с тех пор поправили вручную — часть правок уже стоит («в книге уже так»).
 */
import { container } from "@/server/container";
import { draftTicketAssist } from "@/server/helpBook";

const numbers = process.argv.slice(2).map(Number).filter((n) => n > 0);
for (const n of numbers) {
  const t = await container().support.tickets.byNumber(n);
  if (!t) {
    console.log(`№${n}: нет обращения`);
    continue;
  }
  const a = await draftTicketAssist(t, { pretendOpen: true }).catch((err) => ({ state: "failed", reason: String(err), lines: [], reply: "", bookTitle: "" }) as never);
  console.log(`\n=== №${n}: ${t.description.replace(/\s+/g, " ").slice(0, 160)}`);
  console.log(`книга: ${a.bookTitle || "—"} · ${a.state}${a.reply ? ` · ${a.reply}` : ""}${a.reason ? ` · причина: ${a.reason}` : ""}`);
  for (const l of a.lines) console.log(`  • ${l}`);
}
process.exit(0);
