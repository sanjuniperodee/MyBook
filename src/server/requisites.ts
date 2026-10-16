import "server-only";
import { getSettings } from "@/modules/workspace";
import { formatPhone, normalizePhone } from "@/shared/domain/phone";
import type { Messages } from "@/i18n/messages";

/**
 * Реквизиты перевода Kaspi из «Интеграций» → «Оплата переводом» (или TRANSFER_PHONE/TRANSFER_NAME). Не заданы — null:
 * перевод клиенту не показываем нигде (раньше в тексте стояла заглушка).
 */
export async function transferRequisites(): Promise<{ phone: string; name: string } | null> {
  const s = await getSettings(["pay.transferPhone", "pay.transferName"]);
  const digits = normalizePhone(s["pay.transferPhone"]);
  return digits.length >= 10 ? { phone: formatPhone(digits) || digits, name: s["pay.transferName"].trim() } : null;
}

/** Блок «Kaspi перевод» для страницы оплаты на языке клиента; null — реквизиты не заданы. */
export async function manualPaymentProps(m: Messages) {
  const r = await transferRequisites();
  return r ? { title: m.common.manualPayment.title, steps: m.common.manualPayment.steps(r.phone, r.name) } : null;
}
