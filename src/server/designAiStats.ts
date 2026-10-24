import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/shared/infrastructure/db";
import { DEFAULT_PRICES } from "@/modules/assistant";

/**
 * Статистика ИИ-дизайнера для админки: сколько просьб, кто пользуется, какие режимы и модели, во что это обходится и
 * сколько клиентов упёрлось в бесплатный лимит и купило пакет. Всё считается из журнала design_ai_requests и покупок.
 * У записей до 24.10.2026 нет режима, модели и стоимости: режим определяется по форме операций (варианты — с name,
 * оценка — с title), стоимость — по токенам по прайсу Haiku (тогда другой модели не было).
 */

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0);

const haiku = DEFAULT_PRICES["claude-haiku-5-5"];
/** Стоимость запроса в долларах: записанная или оценка по токенам Haiku. */
const COST = sql`coalesce(r.cost_usd, ((r.usage->>'inputTokens')::float8 * ${haiku.input} + (r.usage->>'outputTokens')::float8 * ${haiku.output} + coalesce((r.usage->>'cacheReadTokens')::float8, 0) * ${haiku.cacheRead} + coalesce((r.usage->>'cacheWriteTokens')::float8, 0) * ${haiku.cacheWrite}) / 1000000.0, 0)`;
/** Режим запроса: записанный или по форме операций у старых записей. */
const MODE = sql`coalesce(r.mode, case when jsonb_typeof(r.ops->0) = 'object' and jsonb_exists(r.ops->0, 'name') then 'variants' when jsonb_typeof(r.ops->0) = 'object' and jsonb_exists(r.ops->0, 'title') then 'review' else 'edit' end)`;
const MODEL = sql`coalesce(r.model, 'claude-haiku-5-5')`;
const DAY = sql`(r.created_at at time zone 'Asia/Almaty')::date`;

export interface DesignAiStats {
  days: number;
  totals: { ok: number; failed: number; users: number; free: number; credit: number; withErrors: number; polished: number; polishFixed: number; costUsd: number; estimated: number; avgMs: number | null; inputTokens: number; outputTokens: number };
  /** Все клиенты за всё время: пользовались, дошли до лимита, держат купленные запросы. */
  people: { used: number; hitLimit: number; withCredits: number; creditsLeft: number };
  purchases: { paid: number; paidAmount: number; pending: number; pendingAmount: number };
  byMode: { key: string; requests: number; costUsd: number; avgMs: number | null }[];
  byModel: { key: string; requests: number; costUsd: number }[];
  byTarget: { key: string; requests: number }[];
  byDay: { day: string; requests: number; users: number }[];
  topUsers: { userId: string; name: string; email: string; requests: number; free: number; credit: number; costUsd: number; lastAt: Date; credits: number }[];
  recent: { id: string; at: Date; userId: string; name: string; email: string; bookId: string; bookTitle: string; target: string; mode: string; status: string; source: string; model: string | null; polish: string | null; costUsd: number | null; ms: number | null; prompt: string; errors: number; lastError: string }[];
}

export async function designAiStats(days: number, freeLimit: number): Promise<DesignAiStats> {
  // days = 0 — за всё время.
  const since = days > 0 ? sql`r.created_at >= now() - make_interval(days => ${days})` : sql`true`;
  const [totals, byMode, byModel, byTarget, byDay, people, purchases, top, recent] = await Promise.all([
    db.execute<Row>(sql`
      select count(*) filter (where r.status = 'ok')::int as ok,
        count(*) filter (where r.status = 'failed')::int as failed,
        count(distinct r.user_id) filter (where r.status = 'ok')::int as users,
        count(*) filter (where r.status = 'ok' and r.source = 'free')::int as free,
        count(*) filter (where r.status = 'ok' and r.source = 'credit')::int as credit,
        count(*) filter (where r.status = 'ok' and jsonb_array_length(r.errors) > 0)::int as with_errors,
        count(*) filter (where r.status = 'ok' and r.polish is not null)::int as polished,
        count(*) filter (where r.status = 'ok' and r.polish = 'fixed')::int as polish_fixed,
        coalesce(sum(${COST}) filter (where r.status = 'ok'), 0)::float8 as cost,
        count(*) filter (where r.status = 'ok' and r.cost_usd is null)::int as estimated,
        avg(r.ms) filter (where r.status = 'ok')::float8 as avg_ms,
        coalesce(sum((r.usage->>'inputTokens')::float8 + coalesce((r.usage->>'cacheReadTokens')::float8, 0) + coalesce((r.usage->>'cacheWriteTokens')::float8, 0)) filter (where r.status = 'ok'), 0)::float8 as input_tokens,
        coalesce(sum((r.usage->>'outputTokens')::float8) filter (where r.status = 'ok'), 0)::float8 as output_tokens
      from design_ai_requests r where ${since}`),
    db.execute<Row>(sql`select ${MODE} as key, count(*)::int as requests, coalesce(sum(${COST}), 0)::float8 as cost, avg(r.ms)::float8 as avg_ms from design_ai_requests r where r.status = 'ok' and ${since} group by 1 order by 2 desc`),
    db.execute<Row>(sql`select ${MODEL} as key, count(*)::int as requests, coalesce(sum(${COST}), 0)::float8 as cost from design_ai_requests r where r.status = 'ok' and ${since} group by 1 order by 2 desc`),
    db.execute<Row>(sql`select r.target as key, count(*)::int as requests from design_ai_requests r where r.status = 'ok' and ${since} group by 1 order by 2 desc`),
    db.execute<Row>(sql`select ${DAY}::text as day, count(*)::int as requests, count(distinct r.user_id)::int as users from design_ai_requests r where r.status = 'ok' and ${since} group by 1 order by 1`),
    db.execute<Row>(sql`
      with per as (select user_id, count(*) filter (where source = 'free')::int as free from design_ai_requests where status in ('pending', 'ok') group by 1)
      select (select count(*) from per)::int as used,
        (select count(*) from per where ${freeLimit} > 0 and free >= ${freeLimit})::int as hit_limit,
        (select count(*) from design_ai_credits where balance > 0)::int as with_credits,
        (select coalesce(sum(balance), 0) from design_ai_credits where balance > 0)::int as credits_left`),
    db.execute<Row>(sql`select count(*) filter (where status = 'paid')::int as paid, coalesce(sum(amount) filter (where status = 'paid'), 0)::int as paid_amount, count(*) filter (where status = 'pending_payment')::int as pending, coalesce(sum(amount) filter (where status = 'pending_payment'), 0)::int as pending_amount from design_ai_purchases`),
    db.execute<Row>(sql`
      select r.user_id, u.name, u.email, count(*)::int as requests,
        count(*) filter (where r.source = 'free')::int as free, count(*) filter (where r.source = 'credit')::int as credit,
        coalesce(sum(${COST}), 0)::float8 as cost, max(r.created_at) as last_at, coalesce(c.balance, 0)::int as credits
      from design_ai_requests r join users u on u.id = r.user_id left join design_ai_credits c on c.user_id = r.user_id
      where r.status = 'ok' and ${since} group by r.user_id, u.name, u.email, c.balance order by requests desc, last_at desc limit 15`),
    db.execute<Row>(sql`
      select r.id, r.created_at, r.user_id, u.name, u.email, r.book_id, b.title as book_title, r.target, ${MODE} as mode, r.status, r.source, r.model, r.polish,
        r.cost_usd::float8 as cost, r.ms, left(r.prompt, 200) as prompt, jsonb_array_length(r.errors)::int as errors, coalesce(left(r.errors->>(jsonb_array_length(r.errors) - 1), 160), '') as last_error
      from design_ai_requests r join users u on u.id = r.user_id join books b on b.id = r.book_id
      where ${since} order by r.created_at desc limit 30`),
  ]);
  const t = totals.rows[0] ?? {};
  const p = people.rows[0] ?? {};
  const pu = purchases.rows[0] ?? {};
  return {
    days,
    totals: { ok: n(t.ok), failed: n(t.failed), users: n(t.users), free: n(t.free), credit: n(t.credit), withErrors: n(t.with_errors), polished: n(t.polished), polishFixed: n(t.polish_fixed), costUsd: n(t.cost), estimated: n(t.estimated), avgMs: t.avg_ms === null || t.avg_ms === undefined ? null : n(t.avg_ms), inputTokens: n(t.input_tokens), outputTokens: n(t.output_tokens) },
    people: { used: n(p.used), hitLimit: n(p.hit_limit), withCredits: n(p.with_credits), creditsLeft: n(p.credits_left) },
    purchases: { paid: n(pu.paid), paidAmount: n(pu.paid_amount), pending: n(pu.pending), pendingAmount: n(pu.pending_amount) },
    byMode: byMode.rows.map((r) => ({ key: String(r.key), requests: n(r.requests), costUsd: n(r.cost), avgMs: r.avg_ms === null ? null : n(r.avg_ms) })),
    byModel: byModel.rows.map((r) => ({ key: String(r.key), requests: n(r.requests), costUsd: n(r.cost) })),
    byTarget: byTarget.rows.map((r) => ({ key: String(r.key), requests: n(r.requests) })),
    byDay: byDay.rows.map((r) => ({ day: String(r.day), requests: n(r.requests), users: n(r.users) })),
    topUsers: top.rows.map((r) => ({ userId: String(r.user_id), name: String(r.name ?? ""), email: String(r.email ?? ""), requests: n(r.requests), free: n(r.free), credit: n(r.credit), costUsd: n(r.cost), lastAt: new Date(String(r.last_at)), credits: n(r.credits) })),
    recent: recent.rows.map((r) => ({ id: String(r.id), at: new Date(String(r.created_at)), userId: String(r.user_id), name: String(r.name ?? ""), email: String(r.email ?? ""), bookId: String(r.book_id), bookTitle: String(r.book_title ?? ""), target: String(r.target), mode: String(r.mode), status: String(r.status), source: String(r.source), model: r.model === null ? null : String(r.model), polish: r.polish === null ? null : String(r.polish), costUsd: r.cost === null ? null : n(r.cost), ms: r.ms === null ? null : n(r.ms), prompt: String(r.prompt ?? ""), errors: n(r.errors), lastError: String(r.last_error ?? "") })),
  };
}
