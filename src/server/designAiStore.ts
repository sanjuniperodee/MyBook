import "server-only";
import type { AiPack } from "@/config/site";
import { parseFreeLimit, type DesignTarget } from "@/lib/book/design-ai";
import type { DesignAiAllowance, DesignAiPurchase } from "@/modules/authoring";
import { DEFAULT_PRICES } from "@/modules/assistant";
import { getSetting } from "@/modules/workspace";
import type { Database } from "@/shared/infrastructure/database";
import { container } from "@/server/container";

/**
 * ИИ-дизайнер для роутов, действий и container: учёт запросов и покупок — в модуле authoring
 * (container().authoring.designAi), здесь — то, что связывает его с соседями: лимит бесплатных из настроек
 * рабочего пространства и стоимость ответа по прайсу assistant (ADR 0009 P2: src/server в БД не ходит).
 */

export type { DesignAiAllowance, DesignAiPurchase };

const store = () => container().authoring.designAi;

/** Стоимость ответа по прайсу Anthropic в долларах (токены из журнала ИИ-дизайнера); модели нет в прайсе — null. */
export function designAiCostUsd(usage: Record<string, number>, model: string): number | null {
  const p = DEFAULT_PRICES[model];
  if (!p) return null;
  const usd = ((usage.inputTokens ?? 0) * p.input + (usage.outputTokens ?? 0) * p.output + (usage.cacheReadTokens ?? 0) * p.cacheRead + (usage.cacheWriteTokens ?? 0) * p.cacheWrite) / 1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}

/** Сколько бесплатных запросов на клиента сейчас — настройка «ИИ-дизайнер» в админке. */
export async function designAiFreeLimit(): Promise<number> {
  return parseFreeLimit(await getSetting("designAi.freeLimit"));
}

export async function designAiAllowance(userId: string): Promise<DesignAiAllowance> {
  return store().allowance(userId, await designAiFreeLimit());
}

/** Взять запрос: бесплатный, если остались, иначе купленный. Нет ни того ни другого — null. */
export async function reserveDesignAi(input: { userId: string; bookId: string; target: DesignTarget; prompt: string; mode?: string }, now = new Date()) {
  return store().reserve(input, await designAiFreeLimit(), now);
}

/** Модель ответила: запрос в журнал (и в лимит). */
export function completeDesignAi(id: string, result: Parameters<ReturnType<typeof store>["complete"]>[1]) {
  return store().complete(id, result);
}

/** Модель не ответила: попытка не считается, купленный запрос возвращается на баланс. */
export function failDesignAi(id: string, error: string) {
  return store().fail(id, error);
}

/** Начислить купленные запросы (оплата пакета, ручное начисление в админке). */
export function addDesignAiCredits(userId: string, n: number, tx?: Pick<Database, "insert">) {
  return store().addCredits(userId, n, tx);
}

/** Покупка пакета: сумма и число запросов фиксируются по каталогу сейчас; оплатить — Kaspi (цель ai_pack). */
export function createDesignAiPurchase(userId: string, pack: AiPack): Promise<DesignAiPurchase> {
  return store().createPurchase(userId, pack);
}

export function findDesignAiPurchase(id: string): Promise<DesignAiPurchase | null> {
  return store().findPurchase(id);
}

/** Оплата пакета пришла: «оплачено» и начисление — в текущей транзакции платежа. Повтор — false. */
export function confirmDesignAiPurchase(id: string, paymentId: string): Promise<boolean> {
  return store().confirmPurchase(id, paymentId);
}
