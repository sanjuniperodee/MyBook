// Живая проверка автозаполнения полей сделки (P1-8): те же сделки, что AI уже заполнял сам, разбираются заново текущей
// инструкцией и моделью «Интеграций» — без записи в базу (extractDealFields только предлагает). Рядом — что записал
// прошлый разбор (журнал deal.fields_ai).
//
//   npx tsx scripts/autofill-check.ts [N=12]
import { container } from "../src/server/container";
import { pool } from "@/shared/infrastructure/db";
import { extractSchema, extractSystemPrompt, extractionSource, normalizeExtracted } from "@/modules/assistant/domain";

const parseJson = (t: string): unknown => {
  try {
    return JSON.parse(t.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return null;
  }
};

const n = Number(process.argv[2] ?? 12);
const { rows } = await pool.query<{ deal: string; details: Record<string, unknown> }>(
  `select distinct on (entity_id) entity_id as deal, details from crm_audit
   where action = 'deal.fields_ai' and details->>'auto' = 'true' and created_at > now() - interval '14 days'
   order by entity_id, created_at desc`,
);
const sample = rows.sort(() => Math.random() - 0.5).slice(0, n);
const keys = ["recipient", "occasion", "event_date"];
for (const r of sample) {
  const before = Object.fromEntries(keys.filter((k) => r.details[k] !== undefined).map((k) => [k, r.details[k]]));
  try {
    // Разбор целиком, как с пустой карточкой: что модель достаёт из переписки сейчас (без сравнения с полями сделки).
    const svc = container().assistant.service as unknown as { dossier(id: string): Promise<Parameters<typeof extractionSource>[0]>; data: { dealFields(): Promise<Parameters<typeof extractSchema>[0]> }; model: { ask(i: object): Promise<{ text: string }> } };
    const [d, fields] = await Promise.all([svc.dossier(r.deal), svc.data.dealFields()]);
    const source = extractionSource(d);
    const { text } = await svc.model.ask({ system: extractSystemPrompt(fields, new Date().toISOString().slice(0, 10)), user: source, effort: "low", schema: extractSchema(fields) });
    const values = normalizeExtracted(fields, parseJson(text));
    const now = Object.fromEntries(keys.filter((k) => values[k] !== undefined).map((k) => [k, values[k]]));
    // Поля, уже заполненные в сделке, extractDealFields не предлагает, если значение совпало: показываем и текущее.
    const deal = await container().sales.deals.findById(r.deal);
    const current = Object.fromEntries(keys.map((k) => [k, deal?.customFields?.[k] ?? null]));
    console.log(`${r.deal.slice(0, 8)} было ${JSON.stringify(before)} · в сделке ${JSON.stringify(current)} · новый разбор ${JSON.stringify(now)}`);
  } catch (err) {
    console.log(`${r.deal.slice(0, 8)} ошибка: ${String(err)}`);
  }
}
await pool.end();
process.exit(0);
