/**
 * Предложения ИИ по сделке (crm_ai_proposals): что ИИ увидел в переписке и предлагает сделать, а менеджер применяет
 * одной кнопкой. Здесь — виды, данные и подписи; общие для сервера, сайта и приложения.
 */
export const AI_PROPOSAL_KINDS = ["stage", "order_status"] as const;
export type AiProposalKind = (typeof AI_PROPOSAL_KINDS)[number];

/** pending — ждёт решения; applied — применили; dismissed — отклонили; stale — устарело (сделку уже перевели, заказ сменил статус). */
export const AI_PROPOSAL_STATUSES = ["pending", "applied", "dismissed", "stale"] as const;
export type AiProposalStatus = (typeof AI_PROPOSAL_STATUSES)[number];

export interface AiStagePayload {
  /** Этап, с которого предложено перевести (если сделку уже перевели — предложение устарело). */
  fromStageId: string;
  stageId: string;
  stageName: string;
  /** Для этапа «отказ» — причина из списка воронки. */
  lostReason: string | null;
}

export interface AiOrderStatusPayload {
  orderId: string;
  orderNumber: number;
  /** Статус заказа, при котором предложено (сменился — предложение устарело). */
  fromStatus: string;
  status: "delivered";
}

export type AiProposalPayload = AiStagePayload | AiOrderStatusPayload;

/** Предложение глазами карточки сделки. */
export interface AiProposalView {
  id: string;
  kind: AiProposalKind;
  payload: AiProposalPayload;
  reason: string;
  quote: string | null;
  messageId: string | null;
  confidence: number;
  status: AiProposalStatus;
  createdAt: Date | string;
}

/** Подпись заказа «выдан» — как в заказах; здесь, чтобы предложение читалось без справочника заказов. */
const ORDER_STATUS_ACTION: Record<AiOrderStatusPayload["status"], string> = { delivered: "выданным" };

/** Что предлагает ИИ — одной строкой на кнопке и в ленте. */
export function aiProposalTitle(p: Pick<AiProposalView, "kind" | "payload">): string {
  if (p.kind === "stage") {
    const s = p.payload as AiStagePayload;
    return `Перевести на этап «${s.stageName}»${s.lostReason ? ` — ${s.lostReason}` : ""}`;
  }
  const o = p.payload as AiOrderStatusPayload;
  return `Отметить заказ №${o.orderNumber} ${ORDER_STATUS_ACTION[o.status]}`;
}

/** Подпись пометки «ИИ» в ленте и истории — одна на все места. */
export const AI_MARK = "ИИ";

/** Запись в ленту сделки о том, что сделал ИИ: что, почему и цитата клиента/менеджера. */
export function aiNoteText(action: string, reason: string, quote: string | null): string {
  const q = quote?.replace(/\s+/g, " ").trim();
  return `${AI_MARK}: ${action}. ${reason.replace(/\.$/, "")}${q ? ` — «${q.length > 200 ? `${q.slice(0, 199)}…` : q}»` : ""}.`;
}
