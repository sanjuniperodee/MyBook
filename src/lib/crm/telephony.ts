import "server-only";
import { container } from "@/server/container";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { crmCalls, crmDeals, crmNotes, users, type CrmCall } from "../db/schema";
import { isBlocked } from "./chats";
import { publish } from "./realtime";
import { notifyOwnerOr } from "./notify";
import { formatPhone } from "./phone";
import { getSetting } from "./settings";
import { zadarmaRequestAuth, type CallEvent } from "./telephony-protocol";

export class TelephonyError extends Error {}

const duration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

async function staffByExtension(ext: string | null) {
  if (!ext) return null;
  const u = await db.query.users.findFirst({ where: and(eq(users.sipExtension, ext), eq(users.role, "admin"), eq(users.staffDisabled, false)), columns: { id: true, name: true, email: true } });
  return u ?? null;
}

/** Событие АТС → запись звонка. Идемпотентно: повторная доставка вебхука ничего не дублирует. */
export async function handleCallEvent(e: CallEvent): Promise<CrmCall | null> {
  const call = await handleCallEventInner(e);
  // Карточка входящего звонка должна появиться сразу, а не через интервал опроса.
  if (call) await publish({ type: "call" });
  return call;
}

async function handleCallEventInner(e: CallEvent): Promise<CrmCall | null> {
  const staff = await staffByExtension(e.extension);
  const key = and(eq(crmCalls.provider, e.provider), eq(crmCalls.externalId, e.externalId));
  let call = await db.query.crmCalls.findFirst({ where: key });

  if (!call) {
    if (e.stage === "record") return null; // запись без звонка — игнорируем
    const clientId = e.clientPhone ? await container().sales.deals.findClientByPhone(e.clientPhone) : null;
    const deal = e.clientPhone || clientId ? await container().sales.deals.findOpen({ clientId, phone: e.clientPhone }) : null;
    const [row] = await db
      .insert(crmCalls)
      .values({
        provider: e.provider,
        externalId: e.externalId,
        direction: e.direction,
        clientPhone: e.clientPhone,
        extension: e.extension,
        staffId: staff?.id ?? null,
        clientId,
        dealId: deal?.id ?? null,
        status: "ringing",
        startedAt: e.at,
      })
      .onConflictDoNothing()
      .returning();
    call = row ?? (await db.query.crmCalls.findFirst({ where: key }))!;
  }

  switch (e.stage) {
    case "start":
    case "ringing":
      if (call.status === "ringing" && e.extension && !call.answeredAt) {
        [call] = await db.update(crmCalls).set({ extension: e.extension, staffId: staff?.id ?? call.staffId }).where(eq(crmCalls.id, call.id)).returning();
      }
      return call;
    case "answer":
      [call] = await db
        .update(crmCalls)
        .set({ status: "answered", answeredAt: call.answeredAt ?? e.at, extension: e.extension ?? call.extension, staffId: staff?.id ?? call.staffId })
        .where(eq(crmCalls.id, call.id))
        .returning();
      return call;
    case "record":
      [call] = await db.update(crmCalls).set({ hasRecording: true, recordingRef: e.recordingRef ?? call.recordingRef }).where(eq(crmCalls.id, call.id)).returning();
      return call;
    case "end": {
      const finished = await db
        .update(crmCalls)
        .set({
          status: e.status ?? (call.answeredAt ? "answered" : "missed"),
          endedAt: new Date(),
          durationSec: e.durationSec ?? 0,
          extension: e.extension ?? call.extension,
          staffId: staff?.id ?? call.staffId,
          hasRecording: e.hasRecording || call.hasRecording,
          recordingRef: e.recordingRef ?? call.recordingRef,
        })
        .where(and(eq(crmCalls.id, call.id), isNull(crmCalls.endedAt)))
        .returning();
      if (!finished.length) return call; // уже обработан
      return afterCall(finished[0]);
    }
  }
}

/** Итог звонка: сделка для нового номера, запись в историю, пропущенный → задача и уведомление. */
async function afterCall(call: CrmCall): Promise<CrmCall> {
  // Номер в спаме: звонок в журнале остаётся, но без заявки, задач и уведомлений.
  if (call.clientPhone && (await isBlocked(call.clientPhone))) return call;
  const missed = call.direction === "in" && call.status === "missed";
  if (call.direction === "in" && !call.dealId && call.clientPhone) {
    const deal = await container().sales.deals.create({ title: `Звонок: ${formatPhone(call.clientPhone)}`, source: "call", clientId: call.clientId, contactPhone: call.clientPhone, contactName: call.clientId ? "" : formatPhone(call.clientPhone), unsorted: true });
    [call] = await db.update(crmCalls).set({ dealId: deal.id, clientId: call.clientId ?? deal.clientId }).where(eq(crmCalls.id, call.id)).returning();
  }
  const staff = call.staffId ? await db.query.users.findFirst({ where: eq(users.id, call.staffId), columns: { name: true, email: true } }) : null;
  const who = staff ? ` · ${staff.name || staff.email.split("@")[0]}` : "";
  const text =
    call.direction === "in"
      ? missed
        ? "Пропущенный входящий звонок"
        : call.status === "answered"
          ? `Входящий звонок, ${duration(call.durationSec)}${who}`
          : "Входящий звонок: не состоялся"
      : call.status === "answered"
        ? `Исходящий звонок, ${duration(call.durationSec)}${who}`
        : `Исходящий звонок: не дозвонились${who}`;
  if (call.clientId) await db.insert(crmNotes).values({ clientId: call.clientId, dealId: call.dealId, authorId: call.staffId, kind: "call", text });

  if (call.status === "answered" && call.clientPhone) {
    // Дозвонились — прошлые пропущенные с этого номера считаем обработанными.
    await db
      .update(crmCalls)
      .set({ handledAt: new Date() })
      .where(and(eq(crmCalls.clientPhone, call.clientPhone), eq(crmCalls.status, "missed"), isNull(crmCalls.handledAt), gte(crmCalls.startedAt, sql`now() - interval '7 days'`)));
  }
  if (missed) {
    const deal = call.dealId ? await db.query.crmDeals.findFirst({ where: eq(crmDeals.id, call.dealId), columns: { assigneeId: true, contactName: true } }) : null;
    await notifyOwnerOr(deal?.assigneeId ?? call.staffId, "calls.view", {
      kind: "call",
      title: `Пропущенный звонок: ${formatPhone(call.clientPhone) || "скрытый номер"}`,
      body: deal?.contactName ?? "",
      link: call.dealId ? `/admin/deals/${call.dealId}` : "/admin/calls",
    });
    await container().automation.engine.run("call.missed", { subject: call.id, callId: call.id, dealId: call.dealId, clientId: call.clientId });
  }
  return call;
}

// ─── API провайдера ────────────────────────────────────────────────────────

async function zadarma<T>(path: string, params: Record<string, string>): Promise<T> {
  const [key, secret, base] = await Promise.all([getSetting("zadarma.key"), getSetting("zadarma.secret"), getSetting("zadarma.baseUrl")]);
  if (!key || !secret) throw new TelephonyError("Zadarma не подключена: укажите ключи в разделе «Интеграции»");
  const { query, authorization } = zadarmaRequestAuth(path, params, key, secret);
  let res: Response;
  try {
    res = await fetch(`${(base || "https://api.zadarma.com").replace(/\/$/, "")}${path}?${query}`, { headers: { Authorization: authorization }, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new TelephonyError("Zadarma недоступна, попробуйте ещё раз");
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.status === "error") throw new TelephonyError(`Zadarma: ${String(data.message ?? `HTTP ${res.status}`)}`);
  return data as T;
}

export async function telephonyProvider() {
  return (await getSetting("telephony.provider")) as "off" | "zadarma" | "pbx";
}

/** Звонок из CRM: АТС сначала звонит на внутренний номер сотрудника, затем соединяет с клиентом. */
export async function clickToCall(extension: string | null, phone: string) {
  const provider = await telephonyProvider();
  if (provider !== "zadarma") throw new TelephonyError("Звонок из CRM доступен с Zadarma. Для другой АТС используйте ссылку tel:");
  if (!extension) throw new TelephonyError("У вас не указан внутренний номер — его задаёт руководитель в разделе «Команда»");
  await zadarma("/v1/request/callback/", { from: extension, to: phone });
}

/** Веб-телефон доступен: Zadarma, включён в «Интеграциях», задан номер АТС и внутренний номер сотрудника. */
export async function webphoneAvailable(extension: string | null) {
  if (!extension) return false;
  const [provider, enabled, pbx] = await Promise.all([telephonyProvider(), getSetting("zadarma.webphone"), getSetting("zadarma.pbxId")]);
  return provider === "zadarma" && enabled === "on" && !!pbx;
}

/** Ключ для WebRTC-виджета Zadarma (живёт 72 часа) и SIP-логин сотрудника. */
export async function webphoneKey(extension: string | null): Promise<{ key: string; sip: string }> {
  if (!(await webphoneAvailable(extension))) throw new TelephonyError("Веб-телефон не настроен: нужен номер АТС в «Интеграциях» и внутренний номер сотрудника в «Команде»");
  const sip = `${(await getSetting("zadarma.pbxId")).replace(/\D/g, "")}-${extension!.replace(/\D/g, "")}`;
  const res = await zadarma<{ key?: string }>("/v1/webrtc/get_key/", { sip });
  if (!res.key) throw new TelephonyError("Zadarma не выдала ключ веб-телефона");
  return { key: res.key, sip };
}

/** Временная ссылка на запись: у Zadarma запрашиваем по требованию, у своей АТС — ссылка из вебхука. */
export async function recordingUrl(call: CrmCall): Promise<string | null> {
  if (!call.hasRecording) return null;
  if (call.provider === "zadarma") {
    const res = await zadarma<{ link?: string; links?: string[] }>("/v1/pbx/record/request/", call.recordingRef ? { call_id: call.recordingRef, lifetime: "600" } : { pbx_call_id: call.externalId, lifetime: "600" });
    return res.link ?? res.links?.[0] ?? null;
  }
  return call.recordingRef && /^https?:\/\//.test(call.recordingRef) ? call.recordingRef : null;
}
