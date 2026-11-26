// Пробный проход «ИИ ведёт этапы» на живой переписке: модель разбирает сделки, ничего не меняя (только чтение и запросы
// к модели помощника). Перед включением crm.aiStages — посмотреть, что ИИ сделал бы сам, что предложил бы, где промолчал.
//   npm run ai-stages:dry-run                 — 20 сделок с самой свежей перепиской за 7 дней
//   npm run ai-stages:dry-run -- 50           — 50 сделок
//   npm run ai-stages:dry-run -- Д1234 Д1235  — эти сделки
import { sql } from "drizzle-orm";

import { pool } from "@/shared/infrastructure/db";
import { executor } from "@/shared/infrastructure/database";
import { aiStagesDeps, aiStagesPass, type AiStagesDeps } from "../src/server/ai-stages";
import { AI_STAGES } from "@/shared/domain/aiStages";
import { aiProposalTitle } from "@/shared/domain/aiProposals";

const args = process.argv.slice(2);
const numbers = args.filter((a) => /^Д?\d+$/i.test(a) && /^Д/i.test(a)).map((a) => Number(a.replace(/\D/g, "")));
const limit = numbers.length ? numbers.length : Number(args.find((a) => /^\d+$/.test(a)) ?? 20);
const real = aiStagesDeps();
const stageName = new Map<string, string>();
const label = new Map<string, string>();

/** Кандидаты как у прохода, но без отметки прошлого разбора и без «затихла» — чтобы проверить на уже разобранных. */
async function candidates(pipelineId: string) {
  const since = new Date(Date.now() - AI_STAGES.lookbackDays * 86_400_000);
  const r = await executor().execute<Record<string, unknown>>(sql`
    select d.id, d.number, d.title, d.stage_id, d.assignee_id, d.ai_stage_at, m.last_in, o.id as order_id, o.number as order_number, o.status as order_status
    from crm_deals d join crm_stages s on s.id = d.stage_id left join orders o on o.id = d.order_id
    join lateral (select max(x.created_at) as last_at, max(x.created_at) filter (where x.direction = 'in') as last_in from crm_messages x join crm_conversations cv on cv.id = x.conversation_id
      where cv.deal_id = d.id and x.internal = false and x.deleted_at is null) m on m.last_at is not null
    where s.pipeline_id = ${pipelineId} and d.unsorted = false and m.last_in is not null
      and ${numbers.length ? sql`d.number in (${sql.join(numbers.map((n) => sql`${n}`), sql`, `)})` : sql`m.last_at >= ${since} and (s.kind <> 'won' or o.status in ('in_production', 'shipped'))`}
    order by m.last_at desc limit ${limit}`);
  for (const x of r.rows) label.set(String(x.id), `Д${x.number} «${String(x.title).slice(0, 40)}»`);
  return r.rows.map((x) => ({ id: String(x.id), stageId: String(x.stage_id), assigneeId: x.assignee_id ? String(x.assignee_id) : null, reviewedAt: null, lastIn: new Date(String(x.last_in instanceof Date ? x.last_in.toISOString() : x.last_in)), order: x.order_id ? { id: String(x.order_id), number: Number(x.order_number), status: String(x.order_status) } : null }));
}

const counts = { apply: 0, propose: 0, none: 0 };
const dry: AiStagesDeps = {
  ...real,
  config: async () => ({ stages: true, manager: true, tasks: true }),
  reviewedToday: async () => 0,
  async funnel() {
    const f = await real.funnel();
    for (const s of f?.stages ?? []) stageName.set(s.id, s.name);
    return f;
  },
  candidates: (f) => candidates(f.pipelineId),
  markReviewed: async () => {},
  async review(dealId, input) {
    const r = await real.review(dealId, input);
    const v = r.review;
    const m = v?.message ? r.messages[v.message - 1] : undefined;
    console.log(`\n${label.get(dealId)} — сейчас «${input.current}»`);
    console.log(v ? `  модель: этап ${v.stage ? `«${input.stages[v.stage - 1]?.name}»` : "без изменений"}${v.lostReason ? ` (${v.lostReason})` : ""}, уверенность ${v.confidence}, «${v.reason}»` : "  модель: нет ответа или переписки");
    if (v?.quote) console.log(`  цитата [${v.message}] ${m ? (m.direction === "in" ? "клиент" : "менеджер") : "нет такого сообщения"}: «${v.quote}»`);
    if (v?.delivered) console.log(`  выдан заказ: «${v.delivered.quote}»`);
    if (v?.manager) console.log(`  менеджер: ${input.staff[v.manager.n - 1]} — [${v.manager.message}] «${v.manager.quote}»`);
    for (const p of v?.promises ?? []) console.log(`  обещание (${p.who}): ${p.what}${p.due ? ` к ${p.due}` : ""} — [${p.message}] «${p.quote}»`);
    for (const x of v?.done ?? []) console.log(`  сделано: задача ${x.task} — [${x.message}] «${x.quote}»`);
    counts.none++;
    return r;
  },
  move: async (dealId, stageId, lostReason, ai) => {
    counts.none--;
    counts.apply++;
    console.log(`  → СДЕЛАЛ БЫ САМ: «${stageName.get(stageId)}»${lostReason ? ` (${lostReason})` : ""} — ${ai.reason}`);
  },
  assign: async (_dealId, _staffId, note) => {
    console.log(`  → НАЗНАЧИЛ БЫ САМ: ${note}`);
  },
  attribute: async (ids) => {
    console.log(`  → ПРИПИСАЛ БЫ сообщений с телефона магазина: до ${ids.length}`);
    return ids.length;
  },
  createTask: async (t) => (console.log(`  → ЗАДАЧА БЫЛА БЫ: «${t.title}» на ${t.dueAt.toISOString().slice(0, 16)}`), true),
  completeTask: async (id, r) => (console.log(`  → ЗАКРЫЛ БЫ задачу ${id.slice(0, 8)}: ${r}`), true),
  raiseTask: async (id) => console.log(`  → ПОДНЯЛ БЫ задачу ${id.slice(0, 8)}`),
  note: async () => {},
  propose: async (p) => {
    if (p.kind === "stage") {
      counts.none--;
      counts.propose++;
    }
    console.log(`  → ПРЕДЛОЖИЛ БЫ: ${aiProposalTitle(p)} — ${p.reason}`);
    return true;
  },
};

const r = await aiStagesPass({ ...dry, candidates: async (f) => (await dry.candidates({ ...f, limit })).slice(0, limit) }).catch((e) => (console.error(e), null));
console.log(`\nИтого разобрано ${r?.reviewed ?? 0}: сам — ${counts.apply}, предложил — ${counts.propose}, без изменений — ${counts.none}.`);
await pool.end();
process.exit(0);
