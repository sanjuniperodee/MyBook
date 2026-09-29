import "server-only";
import { usersId } from "@/lib/db/refs";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "./db";
import { users } from "./db/schema";
import type { ClientSegment } from "./crm";

export const STALLED_DAYS = 14;

const ltv = sql<number>`coalesce((select sum(o.amount) from orders o where o.user_id = ${usersId} and o.paid_at is not null and o.status <> 'cancelled'), 0)::int`;
const ordersCount = sql<number>`(select count(*)::int from orders o where o.user_id = ${usersId} and o.status <> 'cancelled')`;
const booksCount = sql<number>`(select count(*)::int from books b where b.user_id = ${usersId})`;
const bestAnswered = sql<number>`coalesce((select max((select count(*) from book_questions q where q.book_id = b.id and length(trim(q.answer)) > 0)) from books b where b.user_id = ${usersId}), 0)::int`;
const lastBookUpdate = sql<Date | null>`(select max(b.updated_at) from books b where b.user_id = ${usersId})`;
const lastOrderAt = sql<Date | null>`(select max(o.created_at) from orders o where o.user_id = ${usersId})`;

const hasPaid = sql`exists (select 1 from orders o where o.user_id = ${usersId} and o.paid_at is not null and o.status <> 'cancelled')`;
const hasAnyOrder = sql`exists (select 1 from orders o where o.user_id = ${usersId} and o.status <> 'cancelled')`;
const hasPending = sql`exists (select 1 from orders o where o.user_id = ${usersId} and o.status = 'pending_payment')`;
const draftRecent = sql`exists (select 1 from books b where b.user_id = ${usersId} and b.status = 'draft' and b.updated_at >= now() - interval '${sql.raw(String(STALLED_DAYS))} days')`;
const draftStale = sql`exists (select 1 from books b where b.user_id = ${usersId} and b.status = 'draft') and not exists (select 1 from books b where b.user_id = ${usersId} and b.updated_at >= now() - interval '${sql.raw(String(STALLED_DAYS))} days')`;

export function segmentWhere(segment: ClientSegment): SQL | undefined {
  switch (segment) {
    case "customers":
      return hasPaid;
    case "writing":
      return and(draftRecent, sql`not ${hasAnyOrder}`);
    case "stalled":
      return and(draftStale, sql`not ${hasAnyOrder}`);
    case "unpaid":
      return hasPending;
    case "vip":
      return sql`'vip' = any(${users.tags})`;
    default:
      return undefined;
  }
}

export type ClientSort = "new" | "ltv" | "active";

export async function queryClients(opts: { segment: ClientSegment; q?: string; tag?: string; sort?: ClientSort; limit: number; offset: number }) {
  const w: SQL[] = [eq(users.role, "user")];
  const seg = segmentWhere(opts.segment);
  if (seg) w.push(seg);
  if (opts.tag) w.push(sql`${opts.tag} = any(${users.tags})`);
  const q = opts.q?.trim();
  if (q) {
    const s = `%${q}%`;
    w.push(or(ilike(users.name, s), ilike(users.email, s), ilike(users.phone, s))!);
  }
  const where = and(...w);
  const order = opts.sort === "ltv" ? desc(ltv) : opts.sort === "active" ? sql`${users.lastSeenAt} desc nulls last` : desc(users.createdAt);
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({ user: users, ltv, ordersCount, booksCount, bestAnswered, lastBookUpdate, lastOrderAt })
      .from(users)
      .where(where)
      .orderBy(order)
      .limit(opts.limit)
      .offset(opts.offset),
    db.select({ n: sql<number>`count(*)::int` }).from(users).where(where),
  ]);
  return { rows, total: n };
}

export async function segmentCounts() {
  const [row] = await db
    .select({
      all: sql<number>`count(*)::int`,
      customers: sql<number>`count(*) filter (where ${hasPaid})::int`,
      writing: sql<number>`count(*) filter (where ${draftRecent} and not ${hasAnyOrder})::int`,
      stalled: sql<number>`count(*) filter (where ${draftStale} and not ${hasAnyOrder})::int`,
      unpaid: sql<number>`count(*) filter (where ${hasPending})::int`,
      vip: sql<number>`count(*) filter (where 'vip' = any(${users.tags}))::int`,
    })
    .from(users)
    .where(eq(users.role, "user"));
  return row;
}
