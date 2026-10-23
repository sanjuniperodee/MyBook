import { describe, expect, it } from "vitest";
import { inviteCode, latinName, REFERRAL } from "@/modules/referrals/domain";
import { ReferralService, type ChatPurchase, type InvitePromo, type ReferralPerson, type RewardRecord } from "@/modules/referrals/application";

describe("код-приглашение", () => {
  it("имя латиницей — русские и казахские буквы", () => {
    expect(latinName("Асель Нурланова")).toBe("ASEL");
    expect(latinName("Әсем")).toBe("ASEM");
    expect(latinName("Ғалым")).toBe("GALYM");
    expect(latinName("Жанна")).toBe("ZHANNA");
    expect(latinName("Ұлжан")).toBe("ULZHAN");
    expect(latinName("Anna-Maria")).toBe("ANNAMARIA");
    expect(latinName("Константинопольский")).toHaveLength(10);
  });

  it("без имени — FRIEND, код всегда проходит формат промокода", () => {
    expect(inviteCode("Асель", "7K2Q")).toBe("ASEL-7K2Q");
    expect(inviteCode("", "7K2Q")).toBe("FRIEND-7K2Q");
    expect(inviteCode("李", "7K2Q")).toBe("FRIEND-7K2Q");
    for (const name of ["Асель", "", "Ё", "Константинопольский"]) expect(inviteCode(name, "AB23")).toMatch(/^[A-Z0-9_-]{3,40}$/);
  });
});

function setup(opts: { taken?: string[]; optOut?: boolean; deals?: Record<string, ChatPurchase> } = {}) {
  const promos = new Map<string, InvitePromo & { used?: boolean; expiresAt?: Date | null }>();
  for (const code of opts.taken ?? []) promos.set(code, { code, ownerId: "someone", percent: 10, usable: true });
  const ledger = new Map<string, RewardRecord>();
  // Как уникальные order_id и deal_id в referral_rewards: награда за заказ одна и за сделку одна.
  const taken = new Set<string>();
  const people: Record<string, ReferralPerson> = {
    asel: { name: "Асель Нурланова", email: "asel@x.kz", locale: "ru", optOut: !!opts.optOut },
    dana: { name: "Дана", email: "dana@x.kz", locale: "kk", optOut: false },
  };
  const mails: { to: string; code: string; friendName: string }[] = [];
  let n = 0;
  const suffixes = ["AAAA", "BBBB", "CCCC", "DDDD", "EEEE", "FFFF", "GGGG", "HHHH"];
  const service = new ReferralService(
    {
      ownedBy: async (userId) => [...promos.values()].find((p) => p.ownerId === userId) ?? null,
      createInvite: async ({ ownerId, code, percent }) => {
        if (promos.has(code)) return null;
        promos.set(code, { code, ownerId, percent, usable: true });
        return code;
      },
      lookup: async (code) => promos.get(code.toUpperCase()) ?? null,
      issueReward: async ({ code, percent }) => {
        if (promos.has(code)) return null;
        promos.set(code, { code, ownerId: null, percent, usable: true, used: false, expiresAt: new Date("2027-01-01") });
        return code;
      },
      status: async (codes) => new Map(codes.map((c) => [c, { used: !!promos.get(c)?.used, expiresAt: promos.get(c)?.expiresAt ?? null }])),
    },
    {
      claim: async (r) => {
        const keys = [r.orderId && `o:${r.orderId}`, r.dealId && `d:${r.dealId}`].filter((k): k is string => !!k);
        if (keys.some((k) => taken.has(k))) return null;
        const id = `r${ledger.size + 1}`;
        ledger.set(id, { ...r, code: null });
        keys.forEach((k) => taken.add(k));
        return id;
      },
      setCode: async (id, code) => void (ledger.get(id)!.code = code),
      forReferrer: async (userId) => [...ledger.values()].filter((r) => r.referrerId === userId),
    },
    { get: async (id) => people[id] ?? null },
    { rewarded: async (to, r) => void mails.push({ to: to.email, code: r.code, friendName: r.friendName }) },
    () => suffixes[n++ % suffixes.length],
    { now: () => new Date("2026-10-01T10:00:00Z") },
    { info() {}, warn() {}, error() {} },
    { deal: async (id) => opts.deals?.[id] ?? null },
  );
  const byOrder = (orderId: string) => [...ledger.values()].find((r) => r.orderId === orderId);
  return { service, promos, ledger, mails, byOrder };
}

describe("ReferralService", () => {
  it("код создаётся один раз; занятый код — пробует другой", async () => {
    const { service } = setup({ taken: ["ASEL-AAAA"] });
    const code = await service.invite("asel");
    expect(code).toBe("ASEL-BBBB");
    expect(await service.invite("asel")).toBe(code);
  });

  it("приветствие — только для действующего приглашения", async () => {
    const { service, promos } = setup();
    const code = await service.invite("asel");
    expect(await service.welcome(code)).toEqual({ code, percent: REFERRAL.friendPercent, from: "Асель" });
    promos.set("PLAIN", { code: "PLAIN", ownerId: null, percent: 10, usable: true });
    expect(await service.welcome("PLAIN")).toBeNull();
    promos.get(code)!.usable = false;
    expect(await service.welcome(code)).toBeNull();
  });

  it("друг оплатил — награда и письмо один раз; свой код и заказ без кода — без награды", async () => {
    const { service, mails, ledger, byOrder } = setup();
    const code = await service.invite("asel");
    const paid = { orderId: "o1", number: 1042, userId: "dana", promoCode: code };
    await service.onOrderPaid(paid);
    await service.onOrderPaid(paid); // повтор события
    expect(mails).toEqual([{ to: "asel@x.kz", code: expect.stringMatching(/^ASEL-/), friendName: "Дана" }]);
    expect(byOrder("o1")?.code).toBe(mails[0].code);

    await service.onOrderPaid({ orderId: "o2", number: 1043, userId: "asel", promoCode: code });
    await service.onOrderPaid({ orderId: "o3", number: 1044, userId: "dana", promoCode: null });
    await service.onOrderPaid({ orderId: "o4", number: 1045, userId: "dana", promoCode: "NOPE" });
    expect(ledger.size).toBe(1);
  });

  it("отписавшийся от писем получает награду без письма; сводка показывает награды", async () => {
    const { service, mails, promos } = setup({ optOut: true });
    const code = await service.invite("asel");
    await service.onOrderPaid({ orderId: "o1", number: 7, userId: "dana", promoCode: code });
    expect(mails).toEqual([]);
    const summary = await service.summary("asel");
    expect(summary).toMatchObject({ code, friends: 1, rewards: [{ orderNumber: 7, used: false }] });
    promos.get(summary.rewards[0].code)!.used = true;
    expect((await service.summary("asel")).rewards[0].used).toBe(true);
  });

  it("contacts-d7: друг купил из чата по приглашению — награда за сделку одна, сколько бы счетов ни оплатили", async () => {
    const deal = (o: Partial<ChatPurchase> = {}): ChatPurchase => ({ number: 88, name: "Дана Серикова", clientId: null, inviteCode: "ASEL-AAAA", repeat: false, ...o });
    const { service, mails, ledger, promos } = setup({
      deals: { d1: deal(), d2: deal({ number: 89, inviteCode: null }), d3: deal({ number: 90, repeat: true }), d4: deal({ number: 91, clientId: "asel" }), d5: deal({ number: 92, inviteCode: "PLAIN" }), d6: deal({ number: 93 }) },
    });
    expect(await service.invite("asel")).toBe("ASEL-AAAA");
    promos.set("PLAIN", { code: "PLAIN", ownerId: null, percent: 10, usable: true });
    await service.onDealPaid("d1"); // предоплата
    await service.onDealPaid("d1"); // остаток — та же покупка
    expect(mails).toEqual([{ to: "asel@x.kz", code: expect.stringMatching(/^ASEL-/), friendName: "Дана" }]);
    expect([...ledger.values()]).toEqual([expect.objectContaining({ dealId: "d1", orderId: null, orderNumber: 88, referrerId: "asel", friendId: null, code: mails[0].code })]);
    // Без кода, повторная покупка, сам себя, не приглашение, неизвестная сделка — без награды.
    for (const id of ["d2", "d3", "d4", "d5", "nope"]) await service.onDealPaid(id);
    expect(ledger.size).toBe(1);
    // Код отключили — новых наград из чата нет.
    promos.get("ASEL-AAAA")!.usable = false;
    await service.onDealPaid("d6");
    expect(ledger.size).toBe(1);
    expect((await service.summary("asel")).rewards).toEqual([expect.objectContaining({ orderNumber: 88, chat: true })]);
  });

  it("contacts-d7: заказ сайта по сделке, за которую уже наградили из чата, — второй награды нет", async () => {
    const { service, ledger } = setup({ deals: { d1: { number: 88, name: "Дана", clientId: "dana", inviteCode: "ASEL-AAAA", repeat: false } } });
    const code = await service.invite("asel");
    await service.onDealPaid("d1");
    await service.onOrderPaid({ orderId: "o1", number: 1050, userId: "dana", promoCode: code, dealId: "d1" });
    expect(ledger.size).toBe(1);
  });
});

describe("Порт промокодов для приглашений (server/promo-ports)", () => {
  it("состояние наград — один запрос findByCodes на все коды, ненайденные пропускаются (F4)", async () => {
    const { referralPromos } = await import("@/server/promo-ports");
    const { PromoCode } = await import("@/modules/ordering/domain");
    const now = new Date("2026-03-01");
    const created = PromoCode.create("p1", { code: "R-1", kind: "percent", value: 10, maxUses: 1, expiresAt: new Date("2026-04-01") }, now).snapshot();
    const used = PromoCode.restore("p1", { ...created, usedCount: 1 });
    const fresh = PromoCode.create("p2", { code: "R-2", kind: "percent", value: 10, maxUses: 1, expiresAt: null }, now);
    const calls: string[][] = [];
    const promos = { findByCodes: async (codes: string[]) => (calls.push(codes), [used, fresh]), findByCode: async () => { throw new Error("по одному не ищем"); } };
    const status = await referralPromos(promos as never, () => now).status(["R-1", "R-2", "R-3"]);
    expect(calls).toEqual([["R-1", "R-2", "R-3"]]);
    expect([...status]).toEqual([["R-1", { used: true, expiresAt: new Date("2026-04-01") }], ["R-2", { used: false, expiresAt: null }]]);
  });
});
