"use server";

import { revalidatePath } from "next/cache";
import { getSellerOverrides, giftNoteEnabled, registrationOpen, sanitizeSeller, SELLER_FIELDS, type SellerDetails } from "@/config/site";
import { admin } from "@/i18n/admin";
import { assertStaff, audit } from "@/server/access";
import { ensureCatalog, saveGiftNote, saveRegistration, saveSeller } from "@/server/catalog";
import { BAD_FORM, textForm } from "@/server/input";

export interface SiteState {
  error?: string;
  ok?: string;
}

/**
 * Регистрация клиентов на сайте. Закрыта: страница /register объясняет это, кнопки «Создать книгу» и «Зарегистрироваться» скрыты,
 * на лендингах вместо них — вход, новые аккаунты не создаются. Уже зарегистрированные клиенты входят как обычно;
 * менеджеры по-прежнему заводят клиентов вручную (CRM → Клиенты → Новый клиент).
 */
export async function setRegistrationAction(_: SiteState, form: FormData): Promise<SiteState> {
  const staff = await assertStaff("settings.manage");
  if (!textForm(form).success) return { error: BAD_FORM };
  await ensureCatalog();
  const open = form.get("registration") === "on";
  const before = registrationOpen();
  await saveRegistration(open, staff.user.id);
  await audit(staff, "site.registration", "settings", "site.registration", { from: before, to: open });
  revalidatePath("/", "layout");
  revalidatePath("/admin/site");
  return { ok: open ? "Регистрация открыта: страница и кнопки снова на сайте." : "Регистрация закрыта: кнопки скрыты, новые аккаунты не создаются." };
}

/**
 * Открытка к заказу. Выключена: при оформлении заказа нет поля «Текст открытки», присланный текст не сохраняется. Открытки
 * в уже оформленных заказах остаются: они видны в карточке заказа и на бланке для типографии, сотрудник может их править.
 */
export async function setGiftNoteAction(_: SiteState, form: FormData): Promise<SiteState> {
  const staff = await assertStaff("settings.manage");
  if (!textForm(form).success) return { error: BAD_FORM };
  await ensureCatalog();
  const enabled = form.get("giftNote") === "on";
  const before = giftNoteEnabled();
  await saveGiftNote(enabled, staff.user.id);
  await audit(staff, "settings.update", "settings", "site.giftNote", { from: before, to: enabled });
  revalidatePath("/", "layout");
  revalidatePath("/admin/site");
  return { ok: enabled ? "Открытка включена: клиенты снова могут вписать её текст при оформлении." : "Открытка выключена: при оформлении заказа поля для неё больше нет." };
}

const sellerErrors: Record<keyof SellerDetails, string> = { legalName: admin.sellerNameInvalid, bin: admin.sellerBinInvalid, phone: admin.sellerPhoneInvalid, whatsapp: admin.sellerWhatsappInvalid };

/**
 * Реквизиты продавца: юр. название и БИН (оферта, футер, упаковочный лист), телефон и WhatsApp магазина (футер, сертификат,
 * страницы оплаты и заказа; WhatsApp — общий с рекламными ссылками). Пустое поле — заглушка из config/site.ts и предупреждение в логе.
 */
export async function saveSellerAction(_: SiteState, form: FormData): Promise<SiteState> {
  const staff = await assertStaff("settings.manage");
  const parsed = textForm(form);
  if (!parsed.success) return { error: BAD_FORM };
  const input = Object.fromEntries(SELLER_FIELDS.map((k) => [k, (parsed.data[k] ?? "").trim()])) as Record<keyof SellerDetails, string>;
  const clean = sanitizeSeller(input);
  const wrong = SELLER_FIELDS.find((k) => input[k] && !clean[k]);
  if (wrong) return { error: sellerErrors[wrong] };
  await ensureCatalog();
  const before = getSellerOverrides();
  const saved = await saveSeller(clean, staff.user.id);
  await audit(staff, "settings.update", "settings", "site.seller", { from: before, to: saved });
  revalidatePath("/", "layout");
  revalidatePath("/admin/site");
  const missing = SELLER_FIELDS.filter((k) => !saved[k]).length;
  return { ok: missing ? `Сохранено. Не заполнено полей: ${missing} — там на сайте пока заглушка.` : "Сохранено: на сайте, в оферте и упаковочном листе — эти реквизиты." };
}
