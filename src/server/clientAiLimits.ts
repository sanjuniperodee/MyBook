import "server-only";
import { getSettings } from "@/modules/workspace";

/** Лимит запросов на клиента: за 10 минут и за сутки. */
export interface ClientAiLimit {
  perTenMin: number;
  perDay: number;
}

const whole = (raw: string, fallback: number) => (/^\d{1,5}$/.test(raw.trim()) && Number(raw) >= 1 ? Number(raw) : fallback);

/**
 * Лимиты AI у клиента в редакторе книги — «Интеграции» → AI. У бесплатных моделей свой общий дневной лимит запросов, поэтому
 * владелец подстраивает их под модель: помощник при письме (по умолчанию 10 за 10 минут и 60 в сутки) и корректор (10 и 80).
 */
export async function clientAiLimits(): Promise<{ writer: ClientAiLimit; proofread: ClientAiLimit }> {
  const v = await getSettings(["writer.perTenMin", "writer.perDay", "proofread.perTenMin", "proofread.perDay"]);
  return {
    writer: { perTenMin: whole(v["writer.perTenMin"], 10), perDay: whole(v["writer.perDay"], 60) },
    proofread: { perTenMin: whole(v["proofread.perTenMin"], 10), perDay: whole(v["proofread.perDay"], 80) },
  };
}
