import { describe, expect, it } from "vitest";
import { inviteCode, latinName, REFERRAL } from "@/modules/referrals/domain";
import { ReferralService, type InvitePromo, type ReferralPerson, type RewardRecord } from "@/modules/referrals/application";

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

function setup(opts: { taken?: string[]; optOut?: boolean } = {}) {
  const promos = new Map<string, InvitePromo & { used?: boolean; expiresAt?: Date | null }>();
  for (const code of opts.taken ?? []) promos.set(code, { code, ownerId: "someone", percent: 10, usable: true });
  const ledger = new Map<string, RewardRecord>();
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
        if (ledger.has(r.orderId)) return false;
        ledger.set(r.orderId, { ...r, code: null });
        return true;
      },
      setCode: async (orderId, code) => void (ledger.get(orderId)!.code = code),
      forReferrer: async (userId) => [...ledger.values()].filter((r) => r.referrerId === userId),
    },
    { get: async (id) => people[id] ?? null },
    { rewarded: async (to, r) => void mails.push({ to: to.email, code: r.code, friendName: r.friendName }) },
    () => suffixes[n++ % suffixes.length],
    { now: () => new Date("2026-10-01T10:00:00Z") },
    { info() {}, warn() {}, error() {} },
  );
  return { service, promos, ledger, mails };
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
    const { service, mails, ledger } = setup();
    const code = await service.invite("asel");
    const paid = { orderId: "o1", number: 1042, userId: "dana", promoCode: code };
    await service.onOrderPaid(paid);
    await service.onOrderPaid(paid); // повтор события
    expect(mails).toEqual([{ to: "asel@x.kz", code: expect.stringMatching(/^ASEL-/), friendName: "Дана" }]);
    expect(ledger.get("o1")?.code).toBe(mails[0].code);

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
});
