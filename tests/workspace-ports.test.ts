import { afterEach, describe, expect, it, vi } from "vitest";
import { settingsSecurityStore } from "@/modules/access/infrastructure/adapters";
import { aiConnections, type AssistantSettingKey } from "@/modules/assistant/infrastructure/connection";
import { crmAssistantData } from "@/modules/assistant/infrastructure/data";
import { crmEffects } from "@/modules/automation/infrastructure/adapters";
import { DrizzleSubjectLoader } from "@/modules/automation/infrastructure/persistence";
import { crmMarketingSettings } from "@/modules/marketing/infrastructure/adapters";
import { crmSalesSettings, roundRobinRouter } from "@/modules/sales/infrastructure/adapters";
import { TelephonyError } from "@/modules/telephony/domain";
import { crmCallEffects } from "@/modules/telephony/infrastructure/effects";
import { zadarmaProvider, type TelephonySettingKey } from "@/modules/telephony/infrastructure/zadarma";
import { fieldVars } from "@/shared/domain/customFields";
import { FixedSchedule, MemFieldsReader, MemSettings, SpyLiveFeed, SpyStaffNotifier } from "./doubles/workspace";

// Корень композиции здесь не нужен: все зависимости приходят портами. Обращение к нему — ошибка теста.
vi.mock("@/server/container", () => ({
  container: () => {
    throw new Error("container() не должен вызываться");
  },
}));

afterEach(() => vi.restoreAllMocks());

const dealFields = [
  { key: "recipient", label: "Для кого", type: "text", options: [] },
  { key: "event_date", label: "Дата события", type: "date", options: [] },
  { key: "gift", label: "В подарок", type: "checkbox", options: [] },
];

describe("свои поля: переменные шаблонов (fieldVars)", () => {
  it("значения по подписям полей: дата — дд.мм.гггг, флажок — да/нет, пустые и неизвестные пропускаются", () => {
    expect(fieldVars(dealFields, { recipient: "бабушка Роза", event_date: "2026-10-14", gift: false, unknown: "x" })).toEqual({ "Для кого": "бабушка Роза", "Дата события": "14.10.2026", "В подарок": "нет" });
    expect(fieldVars(dealFields, { recipient: "", gift: true, event_date: null })).toEqual({ "В подарок": "да" });
    expect(fieldVars(dealFields, null)).toEqual({});
  });
});

describe("access: правила безопасности в настройках", () => {
  it("читает и пишет только свои ключи; 2FA — on/off", async () => {
    const settings = new MemSettings<"security.ipAllowlist" | "security.require2fa">();
    const store = settingsSecurityStore(settings);
    expect(await store.load()).toEqual({ allowlist: "", require2fa: false });
    await store.save({ allowlist: "10.0.0.0/8", require2fa: true }, "owner-1");
    expect(settings.saves).toEqual([{ values: { "security.ipAllowlist": "10.0.0.0/8", "security.require2fa": "on" }, actorId: "owner-1" }]);
    expect(await store.load()).toEqual({ allowlist: "10.0.0.0/8", require2fa: true });
  });
});

describe("sales: настройки и график", () => {
  it("«Неразобранное» включено, пока не off; с какого действия заводить сделку — как в настройке", async () => {
    const settings = new MemSettings<"crm.unsorted" | "crm.autoDealFrom">({ "crm.autoDealFrom": "book_half" });
    const s = crmSalesSettings(settings);
    expect([await s.unsortedEnabled(), await s.autoDealFrom()]).toEqual([true, "book_half"]);
    settings.values.set("crm.unsorted", "off");
    expect(await s.unsortedEnabled()).toBe(false);
  });

  it("вне рабочего времени заявку по кругу не получает никто (база не нужна)", async () => {
    const schedule = new FixedSchedule(false);
    expect(await roundRobinRouter(schedule).nextRoundRobin()).toBeNull();
    expect(schedule.asked).toHaveLength(1);
  });
});

describe("marketing: настройки", () => {
  it("предел скидки — число (пусто — 0); номер WhatsApp — цифры из настроек, иначе из контактов сайта", async () => {
    const settings = new MemSettings<"crm.maxDiscount" | "crm.whatsappNumber">();
    const s = crmMarketingSettings(settings);
    expect([await s.maxDiscount(), await s.whatsappNumber()]).toEqual([0, "77000000000"]);
    settings.values.set("crm.maxDiscount", "15");
    settings.values.set("crm.whatsappNumber", "+7 (701) 123-45-67");
    expect([await s.maxDiscount(), await s.whatsappNumber()]).toEqual([15, "77011234567"]);
  });
});

describe("telephony: настройки АТС, уведомления и живое обновление", () => {
  it("пропущенный — ответственному, без него — всем с calls.view; журнал обновляется у всех", async () => {
    const notifier = new SpyStaffNotifier({ "calls.view": ["m1", "m2"] });
    const live = new SpyLiveFeed();
    const effects = crmCallEffects({ isBlocked: async () => false, missedRules: async () => {}, notifier, live });
    await effects.notifyMissed(null, { title: "Пропущенный: +7 701 000 00 00", body: "", link: "/admin/calls" });
    await effects.notifyMissed("m3", { title: "Пропущенный", body: "", link: "/admin/calls" });
    effects.callChanged();
    expect(notifier.sent.map((s) => [s.to, s.n.kind])).toEqual([
      [["m1", "m2"], "call"],
      [["m3"], "call"],
    ]);
    expect(live.events).toEqual([{ type: "call" }]);
  });

  it("провайдер и веб-телефон — из настроек; без ключей Zadarma запрос не уходит", async () => {
    const settings = new MemSettings<TelephonySettingKey>({ "telephony.provider": "zadarma", "zadarma.webphone": "on", "zadarma.pbxId": "12345" });
    const zadarma = zadarmaProvider(settings);
    expect(await zadarma.provider()).toBe("zadarma");
    expect(await zadarma.webphoneSettings()).toEqual({ enabled: true, pbxId: "12345" });
    const fetch = vi.spyOn(globalThis, "fetch");
    const err = await zadarma.callback("100", "+77011234567").catch((e) => e);
    expect(TelephonyError.is(err) && err.code).toBe("notConfigured");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("automation: уведомления и свои поля", () => {
  it("«staff» — всем с deals.view, список — адресатам", async () => {
    const notifier = new SpyStaffNotifier({ "deals.view": ["m1", "h1"] });
    const effects = crmEffects(async () => {}, notifier);
    await effects.notify("staff", { kind: "sla", title: "Клиенту не ответили 15 минут", body: "", link: null });
    await effects.notify(["m2"], { kind: "task", title: "Задача", body: "", link: null });
    expect(notifier.sent.map((s) => s.to)).toEqual([["m1", "h1"], ["m2"]]);
  });

  it("переменные своих полей сделки — по полям из рабочего пространства", async () => {
    const fields = new MemFieldsReader({ deal: dealFields });
    expect(await new DrizzleSubjectLoader(fields).dealFieldVars({ recipient: "маме", event_date: "2026-03-08" })).toEqual({ "Для кого": "маме", "Дата события": "08.03.2026" });
  });
});

describe("assistant: подключения и данные", () => {
  it("пустые настройки — Claude с адресом и моделью по умолчанию; корректор — как помощник", async () => {
    const ai = aiConnections(new MemSettings<AssistantSettingKey>());
    expect(await ai.active()).toEqual({ provider: "anthropic", apiKey: "", baseUrl: "https://api.anthropic.com", model: "claude-opus-5-5", enabled: true });
    expect(await ai.proofreadProvider()).toEqual({ provider: "anthropic", own: false });
  });

  it("корректор со своим провайдером, моделью и флажком; ключ провайдера — общий с помощником", async () => {
    const settings = new MemSettings<AssistantSettingKey>({ "ai.provider": "openai", "proofread.provider": "openrouter", "proofread.model": "openrouter/free", "proofread.enabled": "off", "ai.openrouter.apiKey": "or-key", "ai.openrouter.baseUrl": "https://or.example/api/v1/" });
    const ai = aiConnections(settings);
    expect((await ai.active()).provider).toBe("openai");
    expect(await ai.proofreadProvider()).toEqual({ provider: "openrouter", own: true });
    expect(await ai.proofread()).toEqual({ provider: "openrouter", apiKey: "or-key", baseUrl: "https://or.example/api/v1", model: "openrouter/free", enabled: false });
  });

  it("база знаний — из настроек, поля сделки — из рабочего пространства", async () => {
    const data = crmAssistantData(new MemSettings<"ai.knowledge">({ "ai.knowledge": "Доставка по Алматы — 1 день" }), new MemFieldsReader({ deal: dealFields }));
    expect(await data.knowledge()).toBe("Доставка по Алматы — 1 день");
    expect(await data.dealFields()).toEqual(dealFields);
  });
});
