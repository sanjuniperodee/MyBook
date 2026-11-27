import { describe, expect, it } from "vitest";
import { LandingService, type LandingVisitInput, type LandingVisitRepository } from "@/modules/marketing/application";
import { linkCodeFromText, nearestFreeClick, visitAttribution, visitNote, whatsappLink, type LandingVisit } from "@/modules/marketing/domain";
import { channelOf, toAttribution } from "@/shared/domain/channels";
import { isLandingCode, landingDevice, landingUrlFields, newLandingCode } from "@/shared/domain/landing";
import { AD_CREATIVES, AD_DEFAULT_TEXT, adCreativeText } from "@/lib/content/ad-skidka";
import { inbound, setup, start } from "./doubles/botHarness";

const IG_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 357.0.0.25.101 (iPhone15,2; iOS 18_1; ru_RU)";
const FB_ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/489.0.0.53.109;]";

const input = (p: Partial<LandingVisitInput> = {}): LandingVisitInput => ({
  code: "lpk7x2m9",
  landing: "skidka",
  utmSource: "instagram",
  utmMedium: "paid",
  utmCampaign: "skidka-nov",
  utmContent: "reels-1",
  utmTerm: "",
  fbclid: "IwAR0",
  fbp: "",
  fbc: "",
  campaignId: "",
  adsetId: "",
  adId: "",
  placement: "",
  referrer: "",
  userAgent: IG_IPHONE,
  device: "iphone",
  inApp: "instagram",
  ...p,
});

/** Таблица переходов в памяти — как drizzleLandingVisits: заход и нажатие по одному коду, привязка с условием. */
function memoryVisits() {
  const rows: (LandingVisit & { match: string | null })[] = [];
  let seq = 0;
  const repo: LandingVisitRepository = {
    async record(v, clickedAt) {
      const had = rows.find((r) => r.code === v.code);
      if (had) {
        had.clickedAt ??= clickedAt;
        return;
      }
      rows.push({ ...v, id: `v${++seq}`, createdAt: clickedAt ?? now.value, clickedAt, conversationId: null, match: null });
    },
    byCode: async (code) => rows.find((r) => r.code === code) ?? null,
    freeClicks: async (from, to) => rows.filter((r) => !r.conversationId && r.clickedAt && r.clickedAt >= from && r.clickedAt <= to),
    async claim(id, conversationId, match, _at, onlyFree) {
      const r = rows.find((x) => x.id === id);
      if (!r || (onlyFree && r.conversationId)) return false;
      r.conversationId = conversationId;
      r.match = match;
      return true;
    },
  };
  const now = { value: new Date("2026-11-27T09:00:00Z") };
  const service = new LandingService(repo, { now: () => now.value }, () => "Asia/Almaty");
  return { rows, repo, service, now };
}

describe("код перехода и разбор адреса лендинга", () => {
  it("код — «lp» и 6 знаков без похожих; проходит разбор кода в сообщении WhatsApp", () => {
    for (let i = 0; i < 200; i++) expect(isLandingCode(newLandingCode())).toBe(true);
    expect(newLandingCode(() => new Uint8Array([0, 1, 2, 3, 4, 30]))).toBe("lpabcde9");
    const code = newLandingCode();
    const url = new URL(whatsappLink("77775932124", "Здравствуйте! Хочу книгу", code));
    expect(url.origin + url.pathname).toBe("https://wa.me/77775932124");
    expect(url.searchParams.get("text")).toBe(`Здравствуйте! Хочу книгу (код: ${code})`);
    expect(linkCodeFromText(url.searchParams.get("text")!)).toBe(code);
    expect(isLandingCode("insta-bio")).toBe(false);
    expect(isLandingCode("lpk7x2m0")).toBe(false);
  });

  it("из адреса — UTM, fbclid и id объявления; незаполненные шаблоны Meta и пустые — мимо", () => {
    const f = landingUrlFields(new URLSearchParams("utm_source=instagram&utm_medium=paid&utm_campaign=skidka&utm_content=%7B%7Bad.name%7D%7D&fbclid=IwAR0&ad_id=120200&adset_id=&x=1"));
    expect(f).toEqual({ utmSource: "instagram", utmMedium: "paid", utmCampaign: "skidka", fbclid: "IwAR0", adId: "120200" });
  });

  it("креатив из адреса (?c=) — кампания перехода, если utm_campaign нет", () => {
    expect(landingUrlFields(new URLSearchParams("c=NurTik"))).toEqual({ utmCampaign: "nurtik" });
    expect(landingUrlFields(new URLSearchParams("c=nurtik&utm_campaign=dec"))).toEqual({ utmCampaign: "dec" });
  });

  it("текст сообщения по креативу: регистр не важен, неизвестный или пустой — «Здравствуйте! Хочу книгу»", () => {
    expect(adCreativeText("nurtik")).toBe("Здравствуйте! Хочу книгу в подарок. Подскажите, как заказать?");
    expect(adCreativeText(" NurTik ")).toBe(AD_CREATIVES.nurtik);
    expect(adCreativeText("predmetnaya")).toBe("Здравствуйте! Интересует книга в подарок. Хочу узнать подробности.");
    expect(adCreativeText("NOVYIGOD")).toBe("Здравствуйте! Хочу книгу в подарок на Новый год.");
    expect(adCreativeText("smmsidya")).toBe("Здравствуйте! Хочу заказать книгу в подарок. Расскажите, как это работает.");
    for (const c of [null, undefined, "", "abc", "constructor", "__proto__", "toString"]) expect(adCreativeText(c)).toBe(AD_DEFAULT_TEXT);
    expect(AD_DEFAULT_TEXT).toBe("Здравствуйте! Хочу книгу");
    // Слова — латиница в нижнем регистре (их сверяют с адресом без учёта регистра); код перехода разбирается после каждой фразы.
    for (const [c, text] of Object.entries(AD_CREATIVES)) {
      expect(c).toMatch(/^[a-z0-9-]+$/);
      const code = newLandingCode();
      expect(linkCodeFromText(new URL(whatsappLink("77775932124", text, code)).searchParams.get("text")!)).toBe(code);
    }
  });

  it("устройство и встроенный браузер — по User-Agent", () => {
    expect(landingDevice(IG_IPHONE)).toEqual({ device: "iphone", inApp: "instagram" });
    expect(landingDevice(FB_ANDROID)).toEqual({ device: "android", inApp: "facebook" });
    expect(landingDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1.15")).toEqual({ device: "desktop", inApp: "" });
  });

  it("метки сделки: UTM из адреса, без них — приложение браузера; канал в отчёте — Instagram", () => {
    const a = visitAttribution({ ...input(), adId: "" });
    expect(a).toEqual({ source: "instagram", medium: "paid", campaign: "skidka-nov", content: "reels-1", landing: "/skidka" });
    expect(toAttribution(a)).toEqual(a);
    expect(channelOf(a)).toBe("instagram");
    expect(visitAttribution({ ...input({ utmSource: "", utmMedium: "", utmCampaign: "", utmContent: "" }), adId: "120200" })).toEqual({ source: "instagram", medium: "paid", content: "120200", landing: "/skidka" });
    expect(visitAttribution({ ...input({ utmSource: "", utmMedium: "", utmCampaign: "", utmContent: "", inApp: "" }), adId: "" })).toEqual({ source: "landing", medium: "landing", landing: "/skidka" });
  });

  it("по времени — ближайшее свободное нажатие в окне «10 минут до — минута после» первого сообщения", () => {
    const at = new Date("2026-11-27T09:10:00Z");
    const v = (id: string, iso: string | null, conv: string | null = null) => ({ id, clickedAt: iso ? new Date(iso) : null, conversationId: conv });
    const list = [v("old", "2026-11-27T08:59:00Z"), v("taken", "2026-11-27T09:09:30Z", "c0"), v("near", "2026-11-27T09:08:00Z"), v("far", "2026-11-27T09:02:00Z"), v("view", null), v("late", "2026-11-27T09:12:00Z")];
    expect(nearestFreeClick(list, at)?.id).toBe("near");
    expect(nearestFreeClick([v("skew", "2026-11-27T09:10:40Z")], at)?.id).toBe("skew");
    expect(nearestFreeClick([list[0], list[1], list[4], list[5]], at)).toBeNull();
  });
});

describe("привязка диалога к переходу", () => {
  it("по коду в сообщении: метки перехода, примечание с кодом; заход и нажатие — одна запись", async () => {
    const t = memoryVisits();
    await t.service.record(input(), "view");
    await t.service.record(input(), "click");
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0].clickedAt).toEqual(t.now.value);
    const r = await t.service.attribute({ text: "Здравствуйте! Хочу книгу (код: lpk7x2m9)", at: new Date("2026-11-27T09:01:00Z"), conversationId: "c1", byTime: true });
    expect(r).toMatchObject({ match: "code", utm: { source: "instagram", campaign: "skidka-nov", landing: "/skidka" } });
    expect(r!.note).toContain("код lpk7x2m9");
    expect(r!.note).toContain("instagram / paid / skidka-nov");
    expect(r!.note).toContain("14:00"); // переход 09:00 UTC — 14:00 по Алматы
    expect(t.rows[0]).toMatchObject({ conversationId: "c1", match: "code" });
  });

  it("код стёрт — ближайшее нажатие перед сообщением, с пометкой «по времени»; второй диалог берёт следующее", async () => {
    const t = memoryVisits();
    await t.service.record(input({ code: "lpaaaaaa", utmCampaign: "a" }), "click");
    t.now.value = new Date("2026-11-27T09:02:00Z");
    await t.service.record(input({ code: "lpbbbbbb", utmCampaign: "b" }), "click");
    const at = new Date("2026-11-27T09:04:00Z");
    const first = await t.service.attribute({ text: "Здравствуйте", at, conversationId: "c1", byTime: true });
    expect(first).toMatchObject({ match: "time", utm: { campaign: "b" } });
    expect(first!.note).toContain("Источник по времени");
    expect(first!.note).toContain("за 2 мин");
    const second = await t.service.attribute({ text: "Добрый день", at, conversationId: "c2", byTime: true });
    expect(second).toMatchObject({ match: "time", utm: { campaign: "a" } });
    expect(await t.service.attribute({ text: "Привет", at, conversationId: "c3", byTime: true })).toBeNull();
  });

  it("по времени — только для нового диалога; чужой код и роботы превью не считаются", async () => {
    const t = memoryVisits();
    await t.service.record(input({ userAgent: "facebookexternalhit/1.1" }), "click");
    expect(t.rows).toHaveLength(0);
    await t.service.record(input(), "click");
    expect(await t.service.attribute({ text: "Здравствуйте", at: t.now.value, conversationId: "c1", byTime: false })).toBeNull();
    expect(await t.service.attribute({ text: "Хочу книгу (код: insta-bio)", at: t.now.value, conversationId: "c1", byTime: true })).toBeNull();
    expect(t.rows[0].conversationId).toBeNull();
  });

  it("код перехода, который уже взяли по времени, всё равно переходит к своему диалогу", async () => {
    const t = memoryVisits();
    await t.service.record(input(), "click");
    expect(await t.service.attribute({ text: "Здравствуйте", at: t.now.value, conversationId: "c1", byTime: true })).toMatchObject({ match: "time" });
    expect(await t.service.attribute({ text: "Хочу книгу (код: lpk7x2m9)", at: t.now.value, conversationId: "c2", byTime: true })).toMatchObject({ match: "code" });
    expect(t.rows[0]).toMatchObject({ conversationId: "c2", match: "code" });
  });

  it("note по времени с переходом без нажатия — время захода", () => {
    const v: LandingVisit = { ...input(), id: "v1", createdAt: new Date("2026-11-27T09:00:00Z"), clickedAt: null, conversationId: null };
    expect(visitNote(v, "time", new Date("2026-11-27T09:05:00Z"), "Asia/Almaty")).toContain("за 5 мин");
  });
});

describe("новый диалог WhatsApp и переход с лендинга", () => {
  it("заявка получает метки перехода и примечание; ищем по времени только в новом диалоге WhatsApp", async () => {
    const calls: { text: string; byTime: boolean; at: Date }[] = [];
    const t = setup({
      links: {
        fromText: async () => null,
        fromVisit: async (i) => (calls.push(i), { utm: { source: "instagram", medium: "paid", campaign: "skidka-nov", landing: "/skidka" }, note: "Пришёл(а) с лендинга /skidka. Источник по времени" }),
      },
    });
    await t.service.ingest(inbound({ text: "Здравствуйте" }));
    expect(calls).toEqual([{ text: "Здравствуйте", at: start, conversationId: t.conv().id, byTime: true }]);
    expect(t.deals[0].utm).toEqual({ source: "instagram", medium: "paid", campaign: "skidka-nov", landing: "/skidka" });
    expect(t.dealNotes).toContainEqual({ dealId: t.deals[0].id, text: "Пришёл(а) с лендинга /skidka. Источник по времени" });
    // Следующее сообщение того же диалога — заявка уже есть, переход больше не ищем.
    await t.service.ingest(inbound({ text: "Сколько стоит?" }));
    expect(calls).toHaveLength(1);
  });

  it("код рекламной ссылки важнее перехода; сбой поиска перехода не мешает заявке", async () => {
    let asked = 0;
    const byLink = setup({ links: { fromText: async () => ({ source: "instagram", link: "insta-bio" }), fromVisit: async () => (asked++, null) } });
    await byLink.service.ingest(inbound({ text: "Хочу книгу (код: insta-bio)" }));
    expect(asked).toBe(0);
    expect(byLink.deals[0].utm).toEqual({ source: "instagram", link: "insta-bio" });

    const failing = setup({
      links: {
        fromText: async () => null,
        fromVisit: async () => {
          throw new Error("db down");
        },
      },
    });
    await failing.service.ingest(inbound({ text: "Здравствуйте" }));
    expect(failing.deals).toHaveLength(1);
    expect(failing.deals[0].utm).toBeNull();
  });

  it("сообщение не в WhatsApp: по коду — да, по времени — нет", async () => {
    const calls: boolean[] = [];
    const t = setup({ links: { fromText: async () => null, fromVisit: async (i) => (calls.push(i.byTime), null) } });
    await t.service.ingest(inbound({ chatType: "instagram", chatId: "insta_login", text: "Здравствуйте" }));
    expect(calls).toEqual([false]);
  });
});
