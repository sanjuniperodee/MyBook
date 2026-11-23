"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CATALOG_LIMITS, GowaError, MessageActionError, type CatalogSettings, type ProductDraft, type UploadImage } from "@/modules/messaging";
import { assertStaff, assertVisible, assertWorkable, audit } from "@/server/access";
import { container } from "@/server/container";
import { uuid } from "@/server/input";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Ошибка WhatsApp или проверки — текстом сотруднику; остальное — наверх (журнал ошибок). */
function fail(err: unknown): { ok: false; error: string } {
  if (GowaError.is(err) || MessageActionError.is(err)) return { ok: false, error: err.message };
  throw err;
}

const productId = z.string().regex(/^\d{1,40}$/);

const draftSchema = z.object({
  name: z.string().trim().min(1, "Укажите название товара").max(CATALOG_LIMITS.name),
  description: z.string().max(CATALOG_LIMITS.description).default(""),
  price: z
    .string()
    .trim()
    .transform((v) => (v ? Number(v.replace(/\s/g, "").replace(",", ".")) : null))
    .refine((v) => v == null || (Number.isFinite(v) && v >= 0), "Цена — число"),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Валюта — три буквы, например KZT"),
  retailerId: z.string().trim().max(CATALOG_LIMITS.retailerId).default(""),
  url: z.string().trim().max(CATALOG_LIMITS.url).default(""),
  hidden: z.boolean(),
});

/** Товар из формы: поля, новые фото (image) и какие фото из WhatsApp оставить (keep, по порядку). */
async function readForm(form: FormData): Promise<{ draft: ProductDraft; images: UploadImage[]; keep: string[] | null } | { error: string }> {
  const parsed = draftSchema.safeParse({
    name: String(form.get("name") ?? ""),
    description: String(form.get("description") ?? ""),
    price: String(form.get("price") ?? ""),
    currency: String(form.get("currency") ?? "KZT"),
    retailerId: String(form.get("retailerId") ?? ""),
    url: String(form.get("url") ?? ""),
    hidden: form.get("hidden") === "on" || form.get("hidden") === "true",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Проверьте поля товара" };
  const images: UploadImage[] = [];
  for (const f of form.getAll("image")) {
    if (!(f instanceof File) || !f.size) continue;
    images.push({ data: new Uint8Array(await f.arrayBuffer()), name: f.name, mime: f.type });
  }
  const keep = form.get("keepSet") === "1" ? form.getAll("keep").map(String) : null;
  return { draft: parsed.data, images, keep };
}

/** Новый товар в каталоге WhatsApp. */
export async function createProductAction(form: FormData): Promise<Result<{ id: string }>> {
  const staff = await assertStaff("catalog.manage");
  const input = await readForm(form);
  if ("error" in input) return { ok: false, error: input.error };
  try {
    const p = await container().messaging.catalog.create(input.draft, input.images);
    await audit(staff, "catalog.create", "wa_product", p.id, { name: p.name, price: p.price });
    revalidatePath("/admin/catalog");
    return { ok: true, id: p.id };
  } catch (err) {
    return fail(err);
  }
}

/** Изменить товар: WhatsApp заменяет его целиком (фото и видео передаются заново). */
export async function updateProductAction(id: string, form: FormData): Promise<Result> {
  const staff = await assertStaff("catalog.manage");
  const input = await readForm(form);
  if ("error" in input) return { ok: false, error: input.error };
  try {
    const p = await container().messaging.catalog.update(productId.parse(id), input.draft, input.images, input.keep);
    await audit(staff, "catalog.update", "wa_product", p.id, { name: p.name, price: p.price, hidden: p.hidden });
    revalidatePath("/admin/catalog");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setProductHiddenAction(id: string, hidden: boolean): Promise<Result> {
  const staff = await assertStaff("catalog.manage");
  try {
    await container().messaging.catalog.setHidden(productId.parse(id), hidden);
    await audit(staff, hidden ? "catalog.hide" : "catalog.show", "wa_product", id);
    revalidatePath("/admin/catalog");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteProductAction(id: string): Promise<Result> {
  const staff = await assertStaff("catalog.manage");
  try {
    await container().messaging.catalog.remove(productId.parse(id));
    await audit(staff, "catalog.delete", "wa_product", id);
    revalidatePath("/admin/catalog");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Забрать каталог из WhatsApp (товары из приложения WhatsApp Business, проверка WhatsApp). */
export async function syncCatalogAction(): Promise<Result<{ total: number; removed: number }>> {
  await assertStaff("catalog.manage");
  try {
    const r = await container().messaging.catalog.sync();
    revalidatePath("/admin/catalog");
    return { ok: true, ...r };
  } catch (err) {
    return fail(err);
  }
}

// ─── чат ──────────────────────────────────────────────────────────────────

/** Сотрудник может писать в этот диалог (как у обычного ответа). */
async function chatStaff(conversationId: string) {
  const staff = await assertStaff("chats.view", "chats.send");
  const conv = await container().messaging.queries.conversation(uuid.parse(conversationId));
  if (!conv) throw new MessageActionError("Диалог не найден");
  assertWorkable(staff, conv.assigneeId);
  return { staff, conv };
}

/** Товары для выбора в чате (без скрытых, если так в настройках). */
export async function chatProductsAction(): Promise<Result<{ products: { id: string; name: string; price: number | null; currency: string; hidden: boolean; image: boolean }[]; enabled: boolean }>> {
  await assertStaff("chats.view", "chats.send");
  const catalog = container().messaging.catalog;
  const settings = await catalog.settings();
  await catalog.syncIfStale(10 * 60_000);
  const products = await catalog.forChat();
  return { ok: true, enabled: settings.enabled, products: products.map((p) => ({ id: p.id, name: p.name, price: p.price, currency: p.currency, hidden: p.hidden, image: p.imageUrls.length > 0 })) };
}

/** Карточка товара клиенту в чат. */
export async function sendProductAction(conversationId: string, id: string): Promise<Result<{ error?: string | null }>> {
  try {
    const { staff, conv } = await chatStaff(conversationId);
    const msg = await container().messaging.catalog.sendProduct(conv.id, productId.parse(id), staff.user.id);
    if (msg.status === "error") return { ok: false, error: msg.error ?? "Не отправилось" };
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Ссылка на весь каталог клиенту в чат. */
export async function sendCatalogLinkAction(conversationId: string): Promise<Result> {
  try {
    const { staff, conv } = await chatStaff(conversationId);
    const msg = await container().messaging.catalog.sendCatalog(conv.id, staff.user.id);
    if (msg.status === "error") return { ok: false, error: msg.error ?? "Не отправилось" };
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Состав корзины, которую прислал клиент. */
export async function orderItemsAction(messageId: string): Promise<Result<{ items: { name: string; quantity: number; price: number | null }[]; total: number | null; currency: string }>> {
  const staff = await assertStaff("chats.view");
  try {
    const { conversationId, card } = await container().messaging.catalog.orderItems(uuid.parse(messageId));
    const conv = await container().messaging.queries.conversation(conversationId);
    assertVisible(staff, conv?.assigneeId ?? null);
    if (card.kind !== "order") return { ok: false, error: "Это не корзина" };
    return { ok: true, items: card.items ?? [], total: card.total, currency: card.currency };
  } catch (err) {
    return fail(err);
  }
}

// ─── настройки ────────────────────────────────────────────────────────────

const settingsSchema = z.object({
  enabled: z.boolean(),
  linkText: z.string().max(1000),
  linkTitle: z.string().max(100),
  linkDescription: z.string().max(200),
  productText: z.string().max(1000),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  sendHidden: z.boolean(),
});

/** «Интеграции» → «Мессенджеры» → «Каталог WhatsApp». */
export async function saveCatalogSettingsAction(input: CatalogSettings): Promise<Result> {
  const staff = await assertStaff("settings.manage");
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Проверьте поля: валюта — три буквы (KZT)" };
  await container().messaging.catalog.saveSettings(parsed.data, staff.user.id);
  await audit(staff, "settings.update", "settings", "whatsapp.catalog", { enabled: parsed.data.enabled });
  revalidatePath("/admin/settings");
  return { ok: true };
}

/** Проверить, что WhatsApp даёт править каталог (токен рекламного аккаунта номера). */
export async function checkCatalogAccessAction(): Promise<Result<{ lid: string }>> {
  await assertStaff("settings.manage");
  try {
    const t = await container().messaging.gowa.catalogToken(true);
    return { ok: true, lid: t.lid };
  } catch (err) {
    return fail(err);
  }
}
