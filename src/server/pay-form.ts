import "server-only";
import { listFields } from "@/modules/workspace";
import { PAY_FORM_KEY, PAY_FORM_OPTIONS } from "@/shared/domain/expenses";

/** Варианты формы оплаты — из своего поля сделки «Форма оплаты» (владелец может поменять список), иначе — по умолчанию. */
export async function payFormOptions(): Promise<string[]> {
  return (await listFields("deal")).find((f) => f.key === PAY_FORM_KEY)?.options ?? [...PAY_FORM_OPTIONS];
}

/** Форма оплаты из формы приёма денег: пусто — не указана (null), не из списка — ошибка с текстом для сотрудника. */
export async function parsePayForm(raw: unknown): Promise<{ ok: true; form: string | null } | { ok: false; error: string }> {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return { ok: true, form: null };
  if (!(await payFormOptions()).includes(v)) return { ok: false, error: "Такой формы оплаты нет — обновите страницу" };
  return { ok: true, form: v };
}
