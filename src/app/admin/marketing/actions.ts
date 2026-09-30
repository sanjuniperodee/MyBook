"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { crmLinks } from "@/lib/db/schema";
import { assertStaff, audit } from "@/lib/crm/rbac";
import { normalizeSlug } from "@/lib/crm/channels";
import { saveSettings } from "@/lib/crm/settings";

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
  const slug = normalizeSlug(d.slug || `${d.utmSource}-${d.utmCampaign || d.name}`);
  if (slug.length < 2) return { error: "Короткий код — латиница и цифры, минимум 2 символа" };
  if (await db.query.crmLinks.findFirst({ where: eq(crmLinks.slug, slug), columns: { id: true } })) return { error: `Код «${slug}» уже занят — придумайте другой` };
  await db.insert(crmLinks).values({ ...d, slug, targetPath: d.kind === "site" ? d.targetPath : "/", createdById: staff.user.id });
  await audit(staff, "link.create", "link", slug, { name: d.name, source: d.utmSource, campaign: d.utmCampaign });
  revalidatePath("/admin/marketing");
  return { ok: "Ссылка создана", slug };
}

export async function archiveLinkAction(id: string, archived: boolean) {
  const staff = await assertStaff("promo.manage");
  await db.update(crmLinks).set({ archived }).where(eq(crmLinks.id, z.string().uuid().parse(id)));
  await audit(staff, archived ? "link.archive" : "link.restore", "link", id);
  revalidatePath("/admin/marketing");
}

export async function saveWhatsappNumberAction(_: LinkState, form: FormData): Promise<LinkState> {
  const staff = await assertStaff("promo.manage");
  const digits = String(form.get("number") ?? "").replace(/\D/g, "");
  if (digits && (digits.length < 10 || digits.length > 15)) return { error: "Номер в международном формате, например 77001234567" };
  await saveSettings({ "crm.whatsappNumber": digits }, staff.user.id);
  revalidatePath("/admin/marketing");
  return { ok: "Сохранено" };
}
