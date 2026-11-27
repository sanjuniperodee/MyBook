/**
 * Чистые хелперы форм и ответов CRM (сделки, клиенты, новый клиент): для бэкенда на NestJS (apps/backend),
 * без копипасты и без зависимостей от фреймворков.
 */
import type { z } from "zod";
import type { CustomField, Parsed } from "@mybook/contracts";
import { giftsForPlan } from "@/config/site";
import { formatDate } from "@/lib/dates";
import type { DealView } from "@/modules/sales";
import { giftFields } from "@/shared/domain/agreementGifts";
import type { CustomFieldValues } from "@/shared/domain/customFields";
import type { CrmField } from "@/shared/infrastructure/db/schema";

export const CRM_LOCALES = [
  { id: "ru", label: "Русский" },
  { id: "kk", label: "Казахский" },
  { id: "uz", label: "Узбекский" },
  { id: "en", label: "Английский" },
] as const;

const GIFT_LABELS: Record<string, string> = {
  giftwrap: "Подарочная упаковка",
  delivery: "Доставка",
};

/** Доступные пункты «бесплатно по договорённости» для выбранного тарифа сделки. */
export function giftChoices(plan: string | null): Array<{ id: string; label: string }> {
  return (plan ? giftsForPlan(plan) : ["giftwrap", "delivery"]).map((id) => ({ id, label: GIFT_LABELS[id] ?? id }));
}

/** Отказ действия CRM (чужая запись, лимит скидки, заказ уже есть) — 400 с текстом для сотрудника. */
export function refusedResponse(message: string): Response {
  return Response.json({ error: message, code: "refused" }, { status: 400, headers: { "cache-control": "no-store" } });
}

/** Проверка `redirect()` из серверного действия сайта (удаление сделки уводит на список — в API это успех). */
export function isNextRedirect(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const digest = Reflect.get(err, "digest");
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/** Свои поля для формы: описание и значение строкой (как в форме сайта). */
export function fieldsOut(defs: CrmField[], values: CustomFieldValues): z.output<typeof CustomField>[] {
  return defs.map((f) => {
    const v = values[f.key];
    const value = v === null || v === undefined ? "" : f.type === "checkbox" ? (v === true ? "true" : "false") : String(v);
    return { key: f.key, label: f.label, type: f.type, options: f.options, value };
  });
}

/**
 * Значения своих полей из API → поля формы сайта (`cf_<key>`), которые разбирает `readFieldValues`:
 * флажку нужны `cf_<key>__present` и `"on"`. Неизвестные ключи пропускаются.
 */
export function fieldsToForm(form: FormData, defs: CrmField[], values: Record<string, string>): void {
  for (const f of defs) {
    if (!(f.key in values)) continue;
    const v = values[f.key];
    if (f.type === "checkbox") {
      form.set(`cf_${f.key}__present`, "1");
      if (v === "true") form.set(`cf_${f.key}`, "on");
    } else {
      form.set(`cf_${f.key}`, v);
    }
  }
}

/** Собирает форму правки сделки для `updateDealAction`, сохраняя непереданные поля. */
export function buildDealUpdateForm(
  deal: Pick<DealView, "id" | "title" | "contactName" | "amount" | "source" | "tags" | "contactPhone" | "contactEmail" | "extraPhones">,
  body: Parsed<"crmDealUpdate">["body"],
  canEditContacts: boolean,
): FormData {
  const form = new FormData();
  form.set("id", deal.id);
  form.set("title", body.title ?? deal.title);
  form.set("contactName", body.contactName ?? deal.contactName);
  form.set("amount", String(body.amount ?? deal.amount));
  form.set("source", body.source ?? deal.source);
  form.set("tags", (body.tags ?? deal.tags).join(","));
  if (canEditContacts && (body.phone !== undefined || body.email !== undefined || body.extraPhones !== undefined)) {
    form.set("contactPhone", body.phone ?? deal.contactPhone ?? "");
    form.set("contactEmail", body.email ?? deal.contactEmail ?? "");
    form.set("extraPhones", (body.extraPhones ?? deal.extraPhones).join("\n"));
  }
  return form;
}

/** Собирает форму создания клиента из сделки для `createClientFromDealAction`. */
export function buildDealClientCreateForm(body: Parsed<"crmDealClientCreate">["body"]): FormData {
  const form = new FormData();
  form.set("name", body.name);
  form.set("email", body.email);
  form.set("locale", body.locale);
  form.set("channel", body.channel);
  return form;
}

/** Собирает форму «Новый клиент» для `createClientAction`. */
export function buildNewClientForm(body: Parsed<"crmClientCreate">["body"]): FormData {
  const form = new FormData();
  const set = (k: string, v: string | number | undefined) => {
    if (v !== undefined && v !== "") form.set(k, String(v));
  };
  set("name", body.name);
  set("phone", body.phone);
  set("email", body.email);
  set("city", body.city);
  set("channel", body.channel);
  set("locale", body.locale);
  set("password", body.password);
  if (body.deal) {
    const d = body.deal;
    form.set("createDeal", "on");
    set("recipient", d.recipient);
    set("deadline", d.deadline);
    set("plan", d.plan);
    set("count", d.count);
    set("agreed", d.agreed);
    set("prepaid", d.prepaid);
    set("payForm", d.payForm);
    set("stageId", d.stageId);
    set("assigneeId", d.assigneeId);
    set("comment", d.comment);
    for (const g of d.gifts ?? []) form.set(giftFields[g], "on");
  }
  return form;
}

export interface DealLinkInput {
  deal: {
    id: string;
    number: number;
    title: string;
    amount: number;
    closedAt: Date | null;
    createdAt: Date;
  };
  stage: {
    name: string;
  };
}

/** Строка дубля или прошлой сделки контакта для экрана «Ещё» карточки сделки. */
export function formatDealLinkRow(r: DealLinkInput) {
  return {
    id: r.deal.id,
    number: r.deal.number,
    title: r.deal.title,
    stage: r.stage.name,
    amount: r.deal.amount,
    dateLabel: formatDate(r.deal.closedAt ?? r.deal.createdAt),
  };
}
