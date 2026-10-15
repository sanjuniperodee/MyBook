"use server";

import { revalidatePath } from "next/cache";
import { factoryCatalog, getCatalogOverrides, MAX_PRICE, type CatalogOverrides } from "@/config/site";
import { assertStaff, audit } from "@/server/access";
import { ensureCatalog, saveCatalog } from "@/server/catalog";
import { addonLabels, deliveryLabels, planLabels } from "@/modules/ordering/ui/labels";
import { BAD_FORM, textForm } from "@/server/input";

export interface PricingState {
  error?: string;
  ok?: string;
}

/** Цена из поля формы: целое число тенге от 0 до MAX_PRICE. */
function money(form: FormData, name: string, label: string, min = 0): number {
  const raw = String(form.get(name) ?? "").replace(/\s/g, "");
  const n = Number(raw);
  if (!raw || !Number.isInteger(n) || n < min || n > MAX_PRICE) throw new Error(`${label}: укажите целое число от ${min} до ${MAX_PRICE.toLocaleString("ru-RU")} ₸`);
  return n;
}

/**
 * Цены и видимость тарифов. Действуют сразу на витрине, в оформлении, сертификатах и в ответах помощника;
 * уже оформленные заказы хранят свою сумму и не меняются, а договорённая менеджером цена книги в сделке остаётся как указана.
 */
export async function savePricingAction(_: PricingState, form: FormData): Promise<PricingState> {
  const staff = await assertStaff("settings.manage");
  if (!textForm(form).success) return { error: BAD_FORM };
  const next: CatalogOverrides = { plans: {}, addons: {}, delivery: {} };
  try {
    for (const p of factoryCatalog.plans) {
      next.plans![p.id] = {
        price: money(form, `plan_${p.id}_price`, `${planLabels[p.id]}: цена`, 100),
        ...(p.printed ? { extraCopyPrice: money(form, `plan_${p.id}_extra`, `${planLabels[p.id]}: цена допэкземпляра`, 100) } : {}),
        hidden: form.get(`plan_${p.id}_visible`) !== "on",
      };
    }
    for (const a of factoryCatalog.addons) next.addons![a.id] = { price: money(form, `addon_${a.id}_price`, addonLabels[a.id]) };
    for (const d of factoryCatalog.delivery) next.delivery![d.id] = { price: money(form, `delivery_${d.id}_price`, deliveryLabels[d.id]) };
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
  return { ok: "Сохранено. Новые цены уже действуют на сайте; оформленные заказы не меняются." };
}

/** Вернуть заводские цены и тарифы из кода. */
export async function resetPricingAction(): Promise<PricingState> {
  const staff = await assertStaff("settings.manage");
  const before = getCatalogOverrides();
  await saveCatalog(null, staff.user.id);
  await audit(staff, "pricing.reset", "settings", "catalog", { before });
  revalidatePath("/", "layout");
  revalidatePath("/admin/pricing");
  return { ok: "Возвращены заводские цены." };
}
