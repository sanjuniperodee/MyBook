import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Реквизиты продавца (deals-d12): юр. название, БИН, телефон и WhatsApp магазина берутся из настроек CRM («Сайт»);
 * пока значение не задано или это заглушка — на сайте прежнее значение из config/site.ts, а в лог пишется предупреждение.
 */
const settings = new Map<string, string>();
vi.mock("@/modules/workspace", () => ({
  getSetting: async (key: string) => settings.get(key) ?? "",
  getSettings: async (keys: string[]) => Object.fromEntries(keys.map((k) => [k, settings.get(k) ?? ""])),
  saveSettings: async (values: Record<string, string>) => {
    for (const [k, v] of Object.entries(values)) {
      if (v) settings.set(k, v);
      else settings.delete(k);
    }
  },
  deleteSetting: async (key: string) => void settings.delete(key),
}));

const { applySeller, getSellerOverrides, missingSeller, sanitizeSeller, site } = await import("@/config/site");
const { ensureCatalog, saveSeller } = await import("@/server/catalog");

const resetWarned = () => void ((globalThis as { __mybookSellerWarned?: string }).__mybookSellerWarned = undefined);

describe("реквизиты продавца", () => {
  let warnings: string[];
  beforeEach(() => {
    settings.clear();
    resetWarned();
    warnings = [];
    vi.spyOn(console, "warn").mockImplementation((m: string) => void warnings.push(m));
  });
  afterEach(() => {
    applySeller(null);
    resetWarned();
    vi.restoreAllMocks();
  });

  it("пока ничего не задано — на сайте прежние значения из config/site.ts", () => {
    expect(site.contacts.phone).toBe("+7 700 000 00 00");
    expect(site.contacts.whatsapp).toBe("https://wa.me/77000000000");
    expect(site.company).toMatchObject({ legalName: "ИП «MyBooks»", bin: "000000000000" });
    expect(missingSeller(getSellerOverrides())).toEqual(["legalName", "bin", "phone", "whatsapp"]);
  });

  it("подстановка из настроек: футер, оферта, сертификат и упаковочный лист видят настоящие реквизиты", async () => {
    settings.set("site.legalName", "ИП  «Книга   жизни»");
    settings.set("site.bin", "1234 5678 9012");
    settings.set("site.phone", "8 701 123 45 67");
    settings.set("crm.whatsappNumber", "77027654321");
    await ensureCatalog();
    expect(site.company).toMatchObject({ legalName: "ИП «Книга жизни»", bin: "123456789012" });
    expect(site.contacts.phone).toBe("+7 701 123 45 67");
    expect(site.contacts.whatsapp).toBe("https://wa.me/77027654321");
    expect(warnings).toEqual([]);
  });

  it("не задано или заглушка (нулевой БИН, 7 700 000 00 00) — прежнее значение и одно предупреждение в лог, а не каждые 10 секунд", async () => {
    settings.set("site.legalName", "ИП «Книга»");
    settings.set("site.bin", "000000000000");
    settings.set("site.phone", "+7 700 000 00 00");
    await ensureCatalog();
    await ensureCatalog();
    expect(site.company).toMatchObject({ legalName: "ИП «Книга»", bin: "000000000000" });
    expect(site.contacts.phone).toBe("+7 700 000 00 00");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("реквизиты продавца не заданы (БИН, телефон, WhatsApp)");
    // заполнили всё — предупреждений больше нет; стёрли снова — снова одно
    await saveSeller({ legalName: "ИП «Книга»", bin: "123456789012", phone: "77011234567", whatsapp: "77011234567" }, "boss");
    await ensureCatalog();
    expect(warnings).toHaveLength(1);
    await saveSeller({ legalName: "ИП «Книга»" }, "boss");
    expect(settings.has("site.bin")).toBe(false);
    expect(site.company.bin).toBe("000000000000");
    expect(warnings).toHaveLength(2);
  });

  it("sanitizeSeller: пустое, нули, заглушка и слишком длинное отбрасываются", () => {
    expect(sanitizeSeller({ legalName: " ", bin: "123", phone: "77000000000", whatsapp: "12345" })).toEqual({});
    expect(sanitizeSeller({ legalName: "x".repeat(121) })).toEqual({});
    expect(sanitizeSeller({ bin: "980740000123", whatsapp: "+7 (701) 123-45-67" })).toEqual({ bin: "980740000123", whatsapp: "77011234567" });
  });
});
