import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * WhatsApp магазина в «Маркетинге» — тот же номер, что в реквизитах на сайте (crm.whatsappNumber): правила как в «Сайт» →
 * «Реквизиты продавца». «8 701…» не превращается в wa.me/87011234567, менять может только руководитель, изменение — в журнал.
 */
const w = vi.hoisted(() => ({ stored: {} as Record<string, string>, audits: [] as unknown[][], perms: [] as string[] }));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/access", () => ({
  assertStaff: async (perm: string) => (w.perms.push(perm), { user: { id: "boss", email: "boss@b.kz" } }),
  audit: async (_s: unknown, ...rest: unknown[]) => void w.audits.push(rest),
}));
vi.mock("@/modules/workspace", () => ({
  getSetting: async (k: string) => w.stored[k] ?? "",
  saveSettings: async (values: Record<string, string>) => void Object.assign(w.stored, values),
}));
vi.mock("@/server/container", () => ({ container: () => ({}) }));

const { saveWhatsappNumberAction } = await import("@/app/admin/marketing/actions");
const { crmMarketingSettings } = await import("@/modules/marketing/infrastructure/adapters");
const { admin } = await import("@/i18n/admin");

const form = (number: string) => {
  const f = new FormData();
  f.set("number", number);
  return f;
};

describe("WhatsApp магазина в «Маркетинге»", () => {
  beforeEach(() => {
    w.stored = {};
    w.audits = [];
    w.perms = [];
  });

  it("«8 701 123 45 67» сохраняется как 77011234567, по праву «Настройки», с записью в журнал", async () => {
    w.stored["crm.whatsappNumber"] = "77020000001";
    expect(await saveWhatsappNumberAction({}, form("8 701 123 45 67"))).toEqual({ ok: "Сохранено" });
    expect(w.perms).toEqual(["settings.manage"]);
    expect(w.stored["crm.whatsappNumber"]).toBe("77011234567");
    expect(w.audits).toEqual([["settings.update", "settings", "crm.whatsappNumber", { from: "77020000001", to: "77011234567" }]]);
  });

  it("заглушка и короткий номер не сохраняются; пустое поле — вернуть номер из реквизитов сайта", async () => {
    expect(await saveWhatsappNumberAction({}, form("+7 700 000 00 00"))).toEqual({ error: admin.sellerWhatsappInvalid });
    expect(await saveWhatsappNumberAction({}, form("12345"))).toEqual({ error: admin.sellerWhatsappInvalid });
    expect(w.stored).toEqual({});
    expect(await saveWhatsappNumberAction({}, form(""))).toEqual({ ok: "Сохранено" });
    expect(w.stored["crm.whatsappNumber"]).toBe("");
  });

  it("номер, сохранённый раньше как 87011234567, рекламные ссылки и /love читают как 77011234567", async () => {
    const settings = crmMarketingSettings({ get: async () => "87011234567", getMany: async () => ({}) as never });
    expect(await settings.whatsappNumber()).toBe("77011234567");
  });
});
