"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { container } from "@/server/container";
import { assertStaff, audit } from "@/server/access";
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
  const created = await container().marketing.service.createLink({ ...d, createdById: staff.user.id });
  if ("error" in created) return { error: created.error };
  const { slug } = created;
  await audit(staff, "link.create", "link", slug, { name: d.name, source: d.utmSource, campaign: d.utmCampaign });
  revalidatePath("/admin/marketing");
  return { ok: "Ссылка создана", slug };
}

export async function archiveLinkAction(id: string, archived: boolean) {
  const staff = await assertStaff("promo.manage");
  await container().marketing.service.archiveLink(z.string().uuid().parse(id), archived);
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
