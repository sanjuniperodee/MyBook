"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { container } from "@/server/container";
import { assertStaff, audit } from "@/server/access";
import { getSetting, saveSettings } from "@/modules/workspace";
import { sanitizeSeller } from "@/config/site";
import { admin } from "@/i18n/admin";
import { BAD_FORM, textForm, uuid } from "@/server/input";

export type LinkState = { ok?: string; error?: string; slug?: string };

const utmPart = z
  .string()
  .trim()
  .max(60)
  .transform((v) => v.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_.-]/g, ""));

const schema = z.object({
  name: z.string().trim().min(2, "Назовите ссылку, например «Instagram — шапка профиля»").max(80),
  kind: z.enum(["site", "whatsapp"]),
  targetPath: z
    .string()
    .trim()
    .max(200)
    .default("/")
    .refine((p) => p.startsWith("/") && !p.startsWith("//") && !/\s/.test(p), "Адрес страницы начинается с «/», например /gift"),
  waText: z.string().trim().max(300).default(""),
  utmSource: utmPart.refine((v) => v.length > 0, "Укажите источник (utm_source), например instagram"),
  utmMedium: utmPart.default(""),
  utmCampaign: utmPart.default(""),
  utmContent: utmPart.default(""),
  slug: z.string().trim().max(40).default(""),
});

export async function createLinkAction(_: LinkState, form: FormData): Promise<LinkState> {
  const staff = await assertStaff("promo.manage");
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const created = await container().marketing.service.createLink({ ...d, createdById: staff.user.id });
  if ("error" in created) return { error: created.error };
  const { slug } = created;
  await audit(staff, "link.create", "link", slug, { name: d.name, source: d.utmSource, campaign: d.utmCampaign });
  revalidatePath("/admin/marketing");
  return { ok: "Ссылка создана", slug };
}

export async function archiveLinkAction(id: string, archived: boolean) {
  const staff = await assertStaff("promo.manage");
  await container().marketing.service.archiveLink(uuid.parse(id), archived);
  await audit(staff, archived ? "link.archive" : "link.restore", "link", id);
  revalidatePath("/admin/marketing");
}

/**
 * WhatsApp магазина — общий для рекламных ссылок и реквизитов на сайте (футер, /gift, /pay, /love), поэтому те же правила,
 * что в «Сайт» → «Реквизиты»: право settings.manage, номер приводится к 77011234567 («8 701…» — тоже), заглушка не
 * принимается, изменение — в журнал.
 */
export async function saveWhatsappNumberAction(_: LinkState, form: FormData): Promise<LinkState> {
  const staff = await assertStaff("settings.manage");
  if (!textForm(form).success) return { error: BAD_FORM };
  const raw = String(form.get("number") ?? "").trim();
  const number = sanitizeSeller({ whatsapp: raw }).whatsapp ?? "";
  if (raw && !number) return { error: admin.sellerWhatsappInvalid };
  const before = await getSetting("crm.whatsappNumber");
  await saveSettings({ "crm.whatsappNumber": number }, staff.user.id);
  await audit(staff, "settings.update", "settings", "crm.whatsappNumber", { from: before, to: number });
  revalidatePath("/admin/marketing");
  revalidatePath("/", "layout");
  return { ok: "Сохранено" };
}
