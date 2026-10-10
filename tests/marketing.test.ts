import { describe, expect, it } from "vitest";
import { buildChannelReport, conversion, isPreviewBot, linkTarget, type TrackedLink } from "@/modules/marketing/domain";
import { MarketingService, type LinkRepository } from "@/modules/marketing/application";

const now = new Date("2026-10-01T06:00:00Z");
const link = (p: Partial<TrackedLink> = {}): TrackedLink => ({ id: "l1", slug: "insta-bio", kind: "site", targetPath: "/", waText: "", utmSource: "instagram", utmMedium: "social", utmCampaign: "mama", utmContent: "", archived: false, ...p });

describe("отчёт по каналам", () => {
  it("клиенты, заявки, продажи в чате и клики сводятся по каналу, кампании и ссылке", () => {
    const r = buildChannelReport(
      [
        { source: { source: "instagram", medium: "social", campaign: "mama", link: "insta-bio" }, started: true, paid: true, revenue: 20000 },
        { source: null, started: false, paid: false, revenue: 0 },
      ],
      [{ utm: { source: "instagram", medium: "social", campaign: "mama" }, source: "whatsapp", clientId: null, won: true, amount: 15000, hasOrder: false }],
      [{ slug: "insta-bio", source: "instagram", medium: "social", campaign: "mama", clicks: 40 }],
    );
    const insta = r.channels.find((c) => c.revenue > 0)!;
    expect(insta).toMatchObject({ registrations: 1, startedBook: 1, leads: 1, leadsWithoutClient: 1, sales: 2, revenue: 35000, clicks: 40 });
    expect(r.links.get("insta-bio")).toMatchObject({ clicks: 40, registrations: 1 });
    expect(r.total).toMatchObject({ registrations: 2, sales: 2 });
    expect(conversion(insta)).toBe(1);
    expect(conversion({ clicks: 0, registrations: 0, startedBook: 0, leads: 0, sales: 0, revenue: 0 })).toBeNull();
  });
});

describe("отчёт по каналам: деньги по ручным сделкам", () => {
  const utm = { source: "instagram", medium: "social", campaign: "mama" };
  const row = (p: { won?: boolean; amount?: number; hasOrder?: boolean; paid?: number }) => ({ utm, source: "manual", clientId: "c1", won: false, amount: 20000, hasOrder: false, ...p });
  const sales = (deals: ReturnType<typeof row>[]) => buildChannelReport([], deals, []).total;

  it("предоплата — уже продажа на сумму принятых денег, даже пока сделка не закрыта", () => {
    expect(sales([row({ paid: 10000 })])).toMatchObject({ sales: 1, revenue: 10000 });
  });
  it("сделку с платежами закрыли — деньги не считаются второй раз", () => {
    expect(sales([row({ won: true, paid: 10000 })])).toMatchObject({ sales: 1, revenue: 10000 });
    expect(sales([row({ won: true, paid: 20000 })])).toMatchObject({ sales: 1, revenue: 20000 });
  });
  it("успешная сделка без платежей — по её сумме; открытая без денег — не продажа", () => {
    expect(sales([row({ won: true })])).toMatchObject({ sales: 1, revenue: 20000 });
    expect(sales([row({})])).toMatchObject({ sales: 0, revenue: 0 });
  });
  it("по сделке есть заказ на сайте: продажа и деньги заказа — в строке клиента, а предоплата добавляется к выручке без второй продажи", () => {
    expect(sales([row({ hasOrder: true, paid: 10000, won: true })])).toMatchObject({ sales: 0, revenue: 10000 });
    expect(sales([row({ hasOrder: true, won: true })])).toMatchObject({ sales: 0, revenue: 0 });
  });
});

describe("короткие ссылки", () => {
  it("на сайт — с UTM и кодом, в WhatsApp — текст с кодом ссылки", () => {
    expect(linkTarget(link(), "https://mybook.kz", "77010000000")).toContain("utm_source=instagram");
    expect(decodeURIComponent(linkTarget(link({ kind: "whatsapp" }), "https://mybook.kz", "77010000000"))).toContain("(код: insta-bio)");
  });

  it("роботы превью не накручивают переходы; архивная ссылка не работает", async () => {
    expect(isPreviewBot("TelegramBot (like TwitterBot)")).toBe(true);
    const clicks: string[] = [];
    const links: LinkRepository = { bySlug: async (s) => (s === "insta-bio" ? link() : s === "old" ? link({ archived: true }) : null), all: async () => [], recordClick: async (id) => void clicks.push(id), add: async () => {}, setArchived: async () => {} };
    const service = new MarketingService(
      { rows: async () => ({ clients: [], deals: [], clicks: [] }) },
      links,
      { load: async () => ({ locale: "ru", order: null, book: null }) },
      { issuePersonal: async () => null },
      () => "MB-TEST",
      { maxDiscount: async () => 15, whatsappNumber: async () => "77010000000" },
      { appUrl: "https://mybook.kz", link: (p) => `https://mybook.kz${p}`, formatDate: (d) => d.toISOString() },
      { now: () => now },
    );
    expect(await service.follow("insta-bio", "WhatsApp/2.23")).toContain("https://mybook.kz");
    expect(clicks).toEqual([]);
    await service.follow("insta-bio", "Mozilla/5.0");
    expect(clicks).toEqual(["l1"]);
    expect(await service.follow("old", "Mozilla/5.0")).toBeNull();
    expect(await service.attributionFromText("Здравствуйте! (код: insta-bio)")).toMatchObject({ source: "instagram", link: "insta-bio" });
  });
});

describe("предложения из чата", () => {
  const service = (issued: { code: string }[] = []) =>
    new MarketingService(
      { rows: async () => ({ clients: [], deals: [], clicks: [] }) },
      { bySlug: async () => null, all: async () => [], recordClick: async () => {}, add: async () => {}, setArchived: async () => {} },
      { load: async () => ({ locale: "kk", order: null, book: { id: "b1", title: "Анаға" } }) },
      { issuePersonal: async (i) => (issued.push(i), { code: i.code, expiresAt: now }) },
      () => "MB-ABC123",
      { maxDiscount: async () => 15, whatsappNumber: async () => "" },
      { appUrl: "https://mybook.kz", link: (p, l) => `https://mybook.kz/${l}${p}`, formatDate: () => "02.10.2026" },
      { now: () => now },
    );

  it("скидка — в пределах потолка, текст на языке клиента, ссылка сразу с промокодом", async () => {
    await expect(service().buildOffer("c1", { kind: "discount", percent: 20, hours: 24 }, "Менеджер")).rejects.toThrow("от 1 до 15%");
    const issued: { code: string }[] = [];
    const offer = await service(issued).buildOffer("c1", { kind: "discount", percent: 10, hours: 48 }, "Менеджер");
    expect(offer.promo).toBe("MB-ABC123");
    expect(offer.text).toContain("жеңілдік");
    expect(offer.text).toContain("/kk/books/b1/checkout?promo=MB-ABC123");
    await expect(service().buildOffer("c1", { kind: "order" }, "Менеджер")).rejects.toThrow("нет неоплаченного заказа");
  });

  it("без права на скидки — потолок 0", async () => {
    expect(await service().chatOffers("c1", false)).toEqual({ order: null, book: { title: "Анаға" }, maxDiscount: 0 });
  });
});
