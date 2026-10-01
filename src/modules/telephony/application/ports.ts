import type { Call, CallEvent } from "../domain";

export interface CallRepository {
  nextId(): string;
  findByExternal(provider: string, externalId: string): Promise<Call | null>;
  /** false — параллельный вебхук уже создал этот звонок. */
  add(call: Call): Promise<boolean>;
  save(call: Call): Promise<void>;
  /** Завершение атомарно: false — звонок уже завершён другим вебхуком. */
  finish(call: Call): Promise<boolean>;
  /** Дозвонились — прошлые пропущенные с этого номера за неделю считаем обработанными. */
  markMissedHandled(phone: string, now: Date): Promise<void>;
  /** Пропущенный звонок обработан сотрудником; ничей звонок становится его. */
  markHandled(callId: string, staffId: string, now: Date): Promise<void>;
}

export interface StaffDirectory {
  byExtension(extension: string | null): Promise<string | null>;
  displayName(userId: string): Promise<string | null>;
}

export interface SalesGateway {
  findClientByPhone(phone: string): Promise<string | null>;
  findOpenDealId(opts: { clientId: string | null; phone: string }): Promise<string | null>;
  createCallDeal(input: { title: string; clientId: string | null; contactPhone: string; contactName: string }): Promise<{ id: string; clientId: string | null }>;
  dealOwner(dealId: string): Promise<{ assigneeId: string | null; contactName: string } | null>;
}

export interface CallTimeline {
  record(entry: { clientId: string; dealId: string | null; authorId: string | null; text: string }): Promise<void>;
}

export interface CallSideEffects {
  isBlocked(phone: string): Promise<boolean>;
  notifyMissed(assigneeId: string | null, n: { title: string; body: string; link: string }): Promise<void>;
  callChanged(): void;
  missedRules(ctx: { subject: string; callId: string; dealId: string | null; clientId: string | null }): Promise<void>;
}

/** API провайдера (Zadarma). */
export interface TelephonyProvider {
  provider(): Promise<"off" | "zadarma" | "pbx">;
  callback(fromExtension: string, toPhone: string): Promise<void>;
  webphoneSettings(): Promise<{ enabled: boolean; pbxId: string }>;
  webrtcKey(sip: string): Promise<string | null>;
  recordingLink(call: { provider: string; externalId: string; recordingRef: string | null }): Promise<string | null>;
}

export type { CallEvent };
