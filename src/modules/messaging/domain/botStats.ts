/**
 * Статистика бота в настройках: почему беседа ушла менеджеру. Причины передачи пишут оба бота — шаблонный (call,
 * manager, paid…) и AI-продажник (call_request, human_request, price_request…), а часть причин — не просьба клиента,
 * а сбой самого бота: модель не ответила, повтор по кругу, потолок беседы. Сбои показываются отдельно, чтобы не
 * выглядеть вопросами клиентов. Чистые функции.
 */

/** Причины передачи, которые означают сбой бота: модель не ответила, петля, потолок беседы, дважды не прошёл проверку, голосовое не распознано. */
export const BOT_FAILURE_REASONS = ["ai_error", "loop", "limit", "ai_blocked", "voice"] as const;
export type BotFailureReason = (typeof BOT_FAILURE_REASONS)[number];

export const isBotFailure = (reason: string): reason is BotFailureReason => (BOT_FAILURE_REASONS as readonly string[]).includes(reason);

/** Подписи причин передачи менеджеру (синонимы шаблонного бота и продажника — одной подписью). */
export const handoffReasonLabels: Record<string, string> = {
  call: "просили позвонить",
  call_request: "просили позвонить",
  manager: "просили менеджера",
  human_request: "просили менеджера",
  paid: "сообщили об оплате",
  paid_claim: "сообщили об оплате",
  pay: "хотели оплатить",
  payment_issue: "проблема с оплатой или заказом",
  complaint: "жалоба",
  custom_request: "нестандартная просьба",
  media: "прислали фото или файл",
  file_received: "прислали фото или файл",
  objection: "возражения после вариантов",
  price_request: "цену называет менеджер",
  agreed: "согласились — нужен счёт",
  question: "бот не знал ответа",
  unsure: "бот не знал ответа",
  unanswered: "модель промолчала на вопрос",
};

/** Подписи сбоев. */
export const failureReasonLabels: Record<BotFailureReason, string> = {
  ai_error: "модель не ответила дважды",
  loop: "бот повторил своё сообщение (по кругу)",
  limit: "потолок беседы",
  ai_blocked: "ответ модели дважды не прошёл проверку",
  voice: "голосовое не распознано",
};

/** Передачи менеджеру по причинам → обычные причины и сбои. */
export function splitHandoffs(tally: Record<string, number>): { handoffs: Record<string, number>; failures: Record<string, number> } {
  const handoffs: Record<string, number> = {};
  const failures: Record<string, number> = {};
  for (const [reason, n] of Object.entries(tally)) (isBotFailure(reason) ? failures : handoffs)[reason] = n;
  return { handoffs, failures };
}

/** Счётчики по подписям, по убыванию: синонимы («call» и «call_request») — одной строкой; причина без подписи — как есть. */
export function byLabel(tally: Record<string, number>, labels: Record<string, string>): [string, number][] {
  const out = new Map<string, number>();
  for (const [key, n] of Object.entries(tally)) {
    const label = labels[key] ?? key;
    out.set(label, (out.get(label) ?? 0) + n);
  }
  return [...out].sort((a, b) => b[1] - a[1]);
}
