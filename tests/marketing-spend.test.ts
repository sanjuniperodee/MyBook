import { describe, expect, it } from "vitest";
import { buildChannelReport, costPerLead, romi } from "@/modules/marketing/domain";

// Расходы на рекламу, стоимость заявки и ROMI (analytics-7).
describe("расход, стоимость заявки и ROMI по каналам", () => {
  const ig = { source: "instagram", medium: "cpc" };
  const report = buildChannelReport(
    [
      { source: ig, started: true, paid: true, revenue: 30000 },
      { source: ig, started: false, paid: false, revenue: 0 },
    ],
    [{ utm: ig, source: "whatsapp", clientId: null, won: true, amount: 25000, hasOrder: false, paid: 0 }],
    [],
    [
      { channel: "instagram", amount: 20000 },
      { channel: "instagram", amount: 10000 },
      { channel: "tiktok", amount: 5000 },
      { channel: "нет-такого", amount: 999 },
    ],
  );
  const by = (k: string) => report.channels.find((c) => c.key === k)!;

  it("расход суммируется по каналу; канал только с расходом — тоже в отчёте; незнакомый канал — нет", () => {
    expect(by("instagram").spend).toBe(30000);
    expect(by("tiktok")).toMatchObject({ spend: 5000, registrations: 0, revenue: 0 });
    expect(report.total.spend).toBe(35000);
    expect(report.channels.some((c) => c.label === undefined)).toBe(false);
  });

  it("стоимость заявки — расход на регистрации и заявки; ROMI — (выручка − расход) / расход; без расхода — нет", () => {
    expect(costPerLead(by("instagram"))).toBe(10000); // 30 000 на 2 регистрации и 1 заявку
    expect(romi(by("instagram"))).toBeCloseTo((55000 - 30000) / 30000);
    expect(romi(by("tiktok"))).toBe(-1);
    expect(costPerLead(by("tiktok"))).toBeNull();
    expect(romi({ clicks: 0, registrations: 1, startedBook: 0, leads: 0, sales: 1, revenue: 100 })).toBeNull();
  });
});

describe("код источника в сообщении из виджета сайта (chats-19)", () => {
  it("по кампании визита, иначе по странице; распознаётся в первом сообщении", async () => {
    const { linkCodeFromText, widgetCode, widgetCodeTail } = await import("@/modules/marketing/domain");
    expect(widgetCode("Spring Sale 2026", "/gift")).toBe("site-spring-sale-2026");
    expect(widgetCode(null, "/kk/gift/mom")).toBe("site-gift-mom");
    expect(widgetCode("", "/")).toBe("site-home");
    expect(widgetCode(null, "/kk")).toBe("site-home");
    const text = `Здравствуйте! Хочу заказать книгу #${widgetCode("bloggers_nov", "/")}`;
    expect(linkCodeFromText(text)).toBe("site-bloggers-nov");
    expect(widgetCodeTail("site-bloggers-nov")).toBe("bloggers-nov");
    expect(widgetCodeTail("insta-bio")).toBeNull();
  });

  it("сервис: кампания с короткой ссылкой — её метки; без ссылки — сайт и виджет, канал «Прямой заход»", async () => {
    const { MarketingService } = await import("@/modules/marketing/application");
    const { channelOf } = await import("@/shared/domain/channels");
    const link = { id: "l1", slug: "ig-nov", kind: "site" as const, targetPath: "/", waText: "", utmSource: "instagram", utmMedium: "cpc", utmCampaign: "nov", utmContent: "", archived: false };
    const links = { bySlug: async () => null, byCampaign: async (c: string) => (c === "nov" ? link : null), all: async () => [], recordClick: async () => {}, add: async () => {}, setArchived: async () => {} };
    const svc = new MarketingService({ rows: async () => ({ clients: [], deals: [], clicks: [] }) }, links as never, {} as never, {} as never, {} as never, {} as never, { appUrl: "https://mybooks.kz" } as never, { now: () => new Date() });
    expect(await svc.attributionFromText("Хочу книгу #site-nov")).toMatchObject({ source: "instagram", medium: "cpc", campaign: "nov", content: "site-widget" });
    const plain = await svc.attributionFromText("Хочу книгу #site-gift");
    expect(plain).toEqual({ source: "site", medium: "widget", campaign: "gift" });
    expect(channelOf(plain)).toBe("direct");
    expect(await svc.attributionFromText("Сколько стоит?")).toBeNull();
  });

  it("contacts-d7: пришёл по ссылке-приглашению — в сообщении код приглашения, источник «приглашение»", async () => {
    const { MarketingService } = await import("@/modules/marketing/application");
    const { INVITE_CAMPAIGN_PREFIX, inviteFromWidgetTail, widgetCode } = await import("@/modules/marketing/domain");
    const { channelOf } = await import("@/shared/domain/channels");
    const links = { bySlug: async () => null, byCampaign: async () => null };
    const svc = new MarketingService({} as never, links as never, {} as never, {} as never, {} as never, {} as never, {} as never, { now: () => new Date() });
    // /r/ASEL-7K2Q ведёт на главную с utm_campaign=invite-ASEL-7K2Q — виджет допишет код к сообщению.
    const text = `Здравствуйте! Хочу книгу #${widgetCode(`${INVITE_CAMPAIGN_PREFIX}ASEL-7K2Q`, "/")}`;
    const a = await svc.attributionFromText(text);
    expect(a).toEqual({ source: "invite", medium: "referral", campaign: "ASEL-7K2Q", content: "site-widget" });
    expect(channelOf(a)).toBe("recommendation");
    expect(inviteFromWidgetTail("bloggers-nov")).toBeNull();
    expect(inviteFromWidgetTail("invite-")).toBeNull();
  });
});
