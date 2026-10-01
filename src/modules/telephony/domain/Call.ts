import { AggregateRoot } from "@/shared/domain";
import type { CallEvent } from "@/lib/crm/telephony-protocol";

export type { CallEvent, CallStage } from "@/lib/crm/telephony-protocol";

export type CallStatus = "ringing" | "answered" | "missed" | "busy" | "failed";

export interface CallProps {
  provider: string;
  externalId: string;
  direction: "in" | "out";
  clientPhone: string;
  extension: string | null;
  staffId: string | null;
  clientId: string | null;
  dealId: string | null;
  status: CallStatus;
  startedAt: Date;
  answeredAt: Date | null;
  endedAt: Date | null;
  durationSec: number;
  hasRecording: boolean;
  recordingRef: string | null;
}

export const callDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * Звонок из АТС. События провайдера приходят по одному и повторно: звонит → ответили → запись → завершён.
 * Каждое событие меняет звонок только вперёд; завершённый звонок повторное «завершение» не трогает.
 */
export class Call extends AggregateRoot<CallProps> {
  static restore(id: string, props: CallProps) {
    return new Call(id, props);
  }

  static ring(id: string, e: CallEvent, link: { staffId: string | null; clientId: string | null; dealId: string | null }) {
    return new Call(id, {
      provider: e.provider,
      externalId: e.externalId,
      direction: e.direction,
      clientPhone: e.clientPhone,
      extension: e.extension,
      staffId: link.staffId,
      clientId: link.clientId,
      dealId: link.dealId,
      status: "ringing",
      startedAt: e.at,
      answeredAt: null,
      endedAt: null,
      durationSec: 0,
      hasRecording: false,
      recordingRef: null,
    });
  }

  get clientPhone() {
    return this.props.clientPhone;
  }
  get clientId() {
    return this.props.clientId;
  }
  get dealId() {
    return this.props.dealId;
  }
  get staffId() {
    return this.props.staffId;
  }
  get direction() {
    return this.props.direction;
  }
  get status() {
    return this.props.status;
  }
  get isFinished() {
    return !!this.props.endedAt;
  }
  get isMissed() {
    return this.props.direction === "in" && this.props.status === "missed";
  }

  /** Событие АТС. Возвращает, что сделать репозиторию: ничего, сохранить или завершить (атомарно). */
  apply(e: CallEvent, staffId: string | null, now: Date): "unchanged" | "changed" | "finish" {
    const p = this.props;
    switch (e.stage) {
      case "start":
      case "ringing":
        if (p.status !== "ringing" || !e.extension || p.answeredAt) return "unchanged";
        p.extension = e.extension;
        p.staffId = staffId ?? p.staffId;
        return "changed";
      case "answer":
        p.status = "answered";
        p.answeredAt ??= e.at;
        p.extension = e.extension ?? p.extension;
        p.staffId = staffId ?? p.staffId;
        return "changed";
      case "record":
        p.hasRecording = true;
        p.recordingRef = e.recordingRef ?? p.recordingRef;
        return "changed";
      case "end":
        if (p.endedAt) return "unchanged";
        p.status = e.status ?? (p.answeredAt ? "answered" : "missed");
        p.endedAt = now;
        p.durationSec = e.durationSec ?? 0;
        p.extension = e.extension ?? p.extension;
        p.staffId = staffId ?? p.staffId;
        p.hasRecording = !!e.hasRecording || p.hasRecording;
        p.recordingRef = e.recordingRef ?? p.recordingRef;
        return "finish";
    }
  }

  /** Новый номер без сделки — заявка «Звонок: …». */
  get needsDeal() {
    return this.props.direction === "in" && !this.props.dealId && !!this.props.clientPhone;
  }

  linkDeal(dealId: string, clientId: string | null) {
    this.props.dealId = dealId;
    this.props.clientId ??= clientId;
  }

  /** Запись в ленту клиента. */
  summary(staffName: string | null) {
    const p = this.props;
    const who = staffName ? ` · ${staffName}` : "";
    if (p.direction === "in") {
      if (this.isMissed) return "Пропущенный входящий звонок";
      return p.status === "answered" ? `Входящий звонок, ${callDuration(p.durationSec)}${who}` : "Входящий звонок: не состоялся";
    }
    return p.status === "answered" ? `Исходящий звонок, ${callDuration(p.durationSec)}${who}` : `Исходящий звонок: не дозвонились${who}`;
  }
}
