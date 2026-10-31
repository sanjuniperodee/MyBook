"use server";

import { revalidatePath } from "next/cache";
import { factoryCatalog, getCatalogOverrides, isAbroadDelivery, MAX_AI_PACK_REQUESTS, MAX_PRICE, type CatalogOverrides } from "@/config/site";
import { assertStaff, audit } from "@/server/access";
import { ensureCatalog, saveCatalog } from "@/server/catalog";
import { addonLabels, deliveryLabels, planLabels } from "@/modules/ordering/ui/labels";
import { BAD_FORM, textForm } from "@/server/input";
import { botPriceDrift, botPriceWarning } from "@/server/bot-prices";

export interface PricingState {
  error?: string;
  ok?: string;
  /** Сохранено, но у бота остались суммы не из новых цен (база знаний, ответы на частые вопросы). */
  warning?: string;
}

/** Цена из поля формы: целое число тенге от 0 до MAX_PRICE. */
function money(form: FormData, name: string, label: string, min = 0): number {
  const raw = String(form.get(name) ?? "").replace(/\s/g, "");
  const n = Number(raw);
  if (!raw || !Number.isInteger(n) || n < min || n > MAX_PRICE) throw new Error(`${label}: укажите целое число от ${min} до ${MAX_PRICE.toLocaleString("ru-RU")} ₸`);
  return n;
}

/** Число запросов в пакете ИИ-дизайнера: от 1 до MAX_AI_PACK_REQUESTS. */
function requests(form: FormData, name: string, label: string): number {
  const n = Number(String(form.get(name) ?? "").replace(/\s/g, ""));
  if (!Number.isInteger(n) || n < 1 || n > MAX_AI_PACK_REQUESTS) throw new Error(`${label}: укажите целое число запросов от 1 до ${MAX_AI_PACK_REQUESTS}`);
  return n;
}

const aiPackLabel = (n: number) => `Пакет ИИ ${n}`;

/**
 * Цены и видимость тарифов. Действуют сразу на витрине, в оформлении, сертификатах, в ответах помощника и бота, в счёте
 * бота и в лимите скидки менеджеров; уже оформленные заказы хранят свою сумму и не меняются, а договорённая менеджером цена
 * книги в сделке остаётся как указана. Если в базе знаний AI или ответах бота остались суммы не из новых цен — предупреждение.
 */
export async function savePricingAction(_: PricingState, form: FormData): Promise<PricingState> {
  const staff = await assertStaff("settings.manage");
  if (!textForm(form).success) return { error: BAD_FORM };
  const next: CatalogOverrides = { plans: {}, addons: {}, delivery: {}, aiPacks: {} };
  try {
    for (const p of factoryCatalog.plans) {
      next.plans![p.id] = {
        price: money(form, `plan_${p.id}_price`, `${planLabels[p.id]}: цена`, 100),
        ...(p.printed ? { extraCopyPrice: money(form, `plan_${p.id}_extra`, `${planLabels[p.id]}: цена допэкземпляра`, 100) } : {}),
        hidden: form.get(`plan_${p.id}_visible`) !== "on",
      };
    }
    for (const a of factoryCatalog.addons) next.addons![a.id] = { price: money(form, `addon_${a.id}_price`, addonLabels[a.id]), hidden: form.get(`addon_${a.id}_visible`) !== "on" };
    // Доставку в другую страну считает менеджер — цены у неё нет. Курьер и по Казахстану: пустое поле — «рассчитывается
    // индивидуально», вписанная цена — фиксированная.
    for (const d of factoryCatalog.delivery) {
      if (isAbroadDelivery(d.id)) continue;
      if (d.quoted && !String(form.get(`delivery_${d.id}_price`) ?? "").trim()) continue;
      const price = money(form, `delivery_${d.id}_price`, deliveryLabels[d.id]);
      next.delivery![d.id] = d.quoted ? { price, fixed: true } : { price };
    }
    factoryCatalog.aiPacks.forEach((p, i) => {
      // Форма без пакетов (старая вкладка) — их цены не трогаем.
      if (form.get(`ai_${p.id}_price`) === null) {
        const kept = getCatalogOverrides().aiPacks?.[p.id];
        if (kept) next.aiPacks![p.id] = kept;
        return;
      }
      next.aiPacks![p.id] = { requests: requests(form, `ai_${p.id}_requests`, aiPackLabel(i + 1)), price: money(form, `ai_${p.id}_price`, `${aiPackLabel(i + 1)}: цена`, 100), hidden: form.get(`ai_${p.id}_visible`) !== "on" };
    });
  } catch (err) {
    return { error: (err as Error).message };
  }
  if (factoryCatalog.plans.every((p) => next.plans![p.id]?.hidden)) return { error: "Хотя бы один тариф должен продаваться: иначе клиенты не смогут оформить заказ" };
  const before = getCatalogOverrides();
  await saveCatalog(next, staff.user.id);
  await ensureCatalog();
  await audit(staff, "pricing.save", "settings", "catalog", { before, after: getCatalogOverrides() });
  // Страницы с ценами (витрина, /kniga, сертификат) пересоберутся при следующем заходе.
  revalidatePath("/", "layout");
  revalidatePath("/admin/pricing");
  const warning = botPriceWarning(await botPriceDrift().catch(() => [])) ?? undefined;
  return { ok: "Сохранено. Новые цены уже действуют на сайте и в счетах бота; оформленные заказы не меняются.", ...(warning ? { warning } : {}) };
}

/** Вернуть заводские цены и тарифы из кода. */
export async function resetPricingAction(): Promise<PricingState> {
  const staff = await assertStaff("settings.manage");
  const before = getCatalogOverrides();
  await saveCatalog(null, staff.user.id);
  await audit(staff, "pricing.reset", "settings", "catalog", { before });
  revalidatePath("/", "layout");
  revalidatePath("/admin/pricing");
  await ensureCatalog();
  const warning = botPriceWarning(await botPriceDrift().catch(() => [])) ?? undefined;
  return { ok: "Возвращены заводские цены.", ...(warning ? { warning } : {}) };
}
