import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, gte, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { crmCalls, crmNotes, users } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { WHATSAPP, type CallRepository, type CallTimeline, type LiveCallRepository, type StaffDirectory } from "../application";
import { Call } from "../domain";

type Row = typeof crmCalls.$inferSelect;
const toDomain = (r: Row) =>
  Call.restore(r.id, {
    provider: r.provider,
    externalId: r.externalId,
    direction: r.direction,
    clientPhone: r.clientPhone,
    extension: r.extension,
    staffId: r.staffId,
    clientId: r.clientId,
    dealId: r.dealId,
    status: r.status,
    startedAt: r.startedAt,
    answeredAt: r.answeredAt,
    endedAt: r.endedAt,
    durationSec: r.durationSec,
    hasRecording: r.hasRecording,
    recordingRef: r.recordingRef,
  });

const UUID = /^[0-9a-f-]{36}$/i;

export class DrizzleCallRepository implements CallRepository, LiveCallRepository {
  nextId() {
    return randomUUID();
  }
  async findByExternal(provider: string, externalId: string) {
    const [r] = await executor().select().from(crmCalls).where(and(eq(crmCalls.provider, provider), eq(crmCalls.externalId, externalId))).limit(1);
    return r ? toDomain(r) : null;
  }
  async add(call: Call) {
    const rows = await executor().insert(crmCalls).values(call.snapshot()).onConflictDoNothing().returning({ id: crmCalls.id });
    return rows.length > 0;
  }
  async save(call: Call) {
    const { id, ...props } = call.snapshot();
    await executor().update(crmCalls).set(props).where(eq(crmCalls.id, id));
  }
  async finish(call: Call) {
    const { id, ...props } = call.snapshot();
    const rows = await executor().update(crmCalls).set(props).where(and(eq(crmCalls.id, id), isNull(crmCalls.endedAt))).returning({ id: crmCalls.id });
    return rows.length > 0;
  }
  async markHandled(callId: string, staffId: string, now: Date) {
    await executor()
      .update(crmCalls)
      .set({ handledAt: now, staffId: sql`coalesce(${crmCalls.staffId}, ${staffId}::uuid)` })
      .where(eq(crmCalls.id, callId));
  }
  async findById(id: string) {
    if (!UUID.test(id)) return null;
    const [r] = await executor().select().from(crmCalls).where(eq(crmCalls.id, id)).limit(1);
    return r ? toDomain(r) : null;
  }
  async claimAnswer(id: string, staffId: string, at: Date) {
    const rows = await executor()
      .update(crmCalls)
      .set({ status: "answered", answeredAt: at, staffId, heartbeatAt: at })
      .where(and(eq(crmCalls.id, id), eq(crmCalls.provider, WHATSAPP), isNull(crmCalls.endedAt), isNull(crmCalls.answeredAt), or(isNull(crmCalls.staffId), eq(crmCalls.staffId, staffId))))
      .returning({ id: crmCalls.id });
    return rows.length > 0;
  }
  async releaseClaim(id: string, staffId: string) {
    await executor()
      .update(crmCalls)
      .set({ status: "ringing", answeredAt: null, heartbeatAt: null })
      .where(and(eq(crmCalls.id, id), eq(crmCalls.staffId, staffId), isNull(crmCalls.endedAt)));
  }
  async heartbeat(id: string, staffId: string, at: Date) {
    if (!UUID.test(id)) return false;
    const rows = await executor()
      .update(crmCalls)
      .set({ heartbeatAt: at })
      .where(and(eq(crmCalls.id, id), eq(crmCalls.provider, WHATSAPP), eq(crmCalls.staffId, staffId), isNull(crmCalls.endedAt)))
      .returning({ id: crmCalls.id });
    return rows.length > 0;
  }
  async stale(now: Date, opts: { ringMs: number; silentMs: number }) {
    const rows = await executor()
      .select()
      .from(crmCalls)
      .where(
        and(
          eq(crmCalls.provider, WHATSAPP),
          isNull(crmCalls.endedAt),
          or(
            and(isNull(crmCalls.answeredAt), lt(crmCalls.startedAt, new Date(now.getTime() - opts.ringMs))),
            and(isNotNull(crmCalls.answeredAt), lt(sql`coalesce(${crmCalls.heartbeatAt}, ${crmCalls.answeredAt})`, new Date(now.getTime() - opts.silentMs))),
          ),
        ),
      )
      .limit(50);
    return rows.map((r) => ({ call: toDomain(r), lastSeen: r.heartbeatAt }));
  }
  async markMissedHandled(phone: string, now: Date) {
    await executor()
      .update(crmCalls)
      .set({ handledAt: now })
      .where(and(eq(crmCalls.clientPhone, phone), eq(crmCalls.status, "missed"), isNull(crmCalls.handledAt), gte(crmCalls.startedAt, new Date(now.getTime() - 7 * 86_400_000))));
  }
}

export const drizzleStaff: StaffDirectory = {
  async byExtension(extension) {
    if (!extension) return null;
    const [u] = await executor().select({ id: users.id }).from(users).where(and(eq(users.sipExtension, extension), eq(users.role, "admin"), eq(users.staffDisabled, false))).limit(1);
    return u?.id ?? null;
  },
  async byId(userId) {
    const [u] = await executor().select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    return u ?? null;
  },
};

export const crmCallTimeline: CallTimeline = {
  async record(e) {
    await executor().insert(crmNotes).values({ ...e, kind: "call" });
  },
};

/** Read-модель звонков. */
export class DrizzleCallQueries {
  async byId(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [r] = await executor().select().from(crmCalls).where(eq(crmCalls.id, id)).limit(1);
    return r ?? null;
  }
}
