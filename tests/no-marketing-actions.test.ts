import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Стоп-лист из CRM (contacts-18): «Добавить номер» в «Интеграции» → CRM и кнопка «Не писать первым» в карточках клиента
 * и сделки. Права, контейнер и журнал подменены; разбор ввода и тексты — настоящие.
 */
const w = vi.hoisted(() => ({
  audits: [] as unknown[],
  blocked: [] as unknown[],
  marked: [] as unknown[],
  noContacts: false,
  spam: false,
  workable: true,
}));

const DEAL = "0d0d0d0d-0000-4000-8000-000000000001";
const CLIENT = "0c0c0c0c-0000-4000-8000-000000000001";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("@/server/access", () => ({
  assertStaff: async () => ({ user: { id: "boss", email: "boss@b.kz", name: "Руководитель" } }),
  assertVisible: () => {},
  assertWorkable: () => {
    if (!w.workable) throw new Error("forbidden");
  },
  audit: async (_s: unknown, ...rest: unknown[]) => void w.audits.push(rest),
  can: () => true,
  canAssignOthers: () => true,
  ForbiddenError: class extends Error {},
}));
vi.mock("@/server/container", async () => {
  const { MessageActionError } = await import("@/modules/messaging/application/services");
  return {
    container: () => ({
      messaging: {
        chats: {
          blockPhone: async (...a: unknown[]) => void w.blocked.push(a),
          setNoMarketing: async (target: { phones: unknown[] }, on: boolean, by: string, where: string) => {
            if (w.noContacts) throw new MessageActionError("нет номеров");
            w.marked.push({ target, on, by, where });
            return ["77011234567", "77071112233"];
          },
          spamFor: async () => w.spam,
        },
      },
      sales: { deals: { findById: async (id: string) => (id === DEAL ? { id: DEAL, number: 5, clientId: CLIENT, assigneeId: "boss", contactPhone: "77011234567", extraPhones: ["77071112233"] } : null) } },
      reporting: { clientById: async (id: string) => (id === CLIENT ? { id: CLIENT, managerId: null, phone: "+7 701 123 45 67", extraPhones: [] } : null) },
    }),
  };
});

const { addBlocklistAction } = await import("@/app/admin/deals/actions");
const { setClientNoMarketingAction, setDealNoMarketingAction } = await import("@/app/admin/crm-actions");

beforeEach(() => {
  w.audits = [];
  w.blocked = [];
  w.marked = [];
  w.noContacts = false;
  w.spam = false;
  w.workable = true;
});

describe("«Добавить номер» в стоп-лист", () => {
  it("номер приводится к виду 7XXXXXXXXXX, отметка и причина — в стоп-лист и журнал", async () => {
    expect(await addBlocklistAction({ phone: "8 (701) 123-45-67", reason: "no_marketing", note: "  просил по телефону " })).toEqual({ ok: true, message: "Номер в стоп-листе: первыми не пишем" });
    expect(w.blocked).toEqual([["77011234567", "no_marketing", "boss", "просил по телефону"]]);
    expect(w.audits).toEqual([["settings.update", "blocklist", "77011234567", { added: "no_marketing", note: "просил по телефону" }]]);
    expect(await addBlocklistAction({ phone: "+7 702 000 11 22", reason: "spam" })).toEqual({ ok: true, message: "Номер в спаме" });
  });

  it("не номер или чужая отметка — понятный текст, в стоп-лист ничего", async () => {
    expect(await addBlocklistAction({ phone: "12-34", reason: "spam" })).toEqual({ ok: false, message: "Номер телефона — 10–15 цифр, например +7 701 234 56 78" });
    expect(await addBlocklistAction({ phone: "77011234567", reason: "vip" as "spam" })).toEqual({ ok: false, message: "Проверьте введённые данные" });
    expect(w.blocked).toEqual([]);
  });
});

describe("«Не писать первым» в карточках", () => {
  it("сделка: номера сделки, её диалоги и клиент; в журнал — сколько номеров", async () => {
    expect(await setDealNoMarketingAction(DEAL, true)).toEqual({ ok: true, message: "Не пишем первыми: бот не напоминает, правила не пишут" });
    expect(w.marked).toEqual([{ target: { dealId: DEAL, clientId: CLIENT, phones: ["77011234567", "77071112233"] }, on: true, by: "boss", where: "Сделка №5" }]);
    expect(w.audits).toEqual([["deal.no_marketing", "deal", DEAL, { on: true, numbers: 2 }]]);
    expect(await setDealNoMarketingAction(DEAL, false)).toEqual({ ok: true, message: "Снова можно писать первыми" });
  });

  it("клиент: его телефоны и диалоги; нет ни номера, ни переписки — текст, без журнала", async () => {
    expect(await setClientNoMarketingAction(CLIENT, true)).toMatchObject({ ok: true });
    expect(w.marked).toEqual([{ target: { clientId: CLIENT, phones: ["+7 701 123 45 67"] }, on: true, by: "boss", where: "Карточка клиента" }]);
    w.noContacts = true;
    expect(await setClientNoMarketingAction(CLIENT, true)).toEqual({ ok: false, message: "У клиента нет ни номера телефона, ни переписки — отмечать нечего" });
    expect(w.audits).toHaveLength(1);
  });

  it("номер в спаме: «снять» не обещает «можно писать» — сотрудник видит, где убрать спам", async () => {
    w.spam = true;
    expect(await setDealNoMarketingAction(DEAL, false)).toEqual({ ok: false, message: "Номер клиента в спаме — первыми ему не пишем, пока он там. Убрать из спама — «Интеграции» → CRM → «Стоп-лист»" });
    expect(await setClientNoMarketingAction(CLIENT, false)).toMatchObject({ ok: false });
    // Отметить «не писать первым» спаму можно — это ничего не меняет и не мешает.
    expect(await setDealNoMarketingAction(DEAL, true)).toMatchObject({ ok: true });
  });

  it("чужая сделка — отказ; не та сделка и мусор вместо id — без изменений", async () => {
    w.workable = false;
    await expect(setDealNoMarketingAction(DEAL, true)).rejects.toThrow("forbidden");
    w.workable = true;
    expect(await setDealNoMarketingAction("0d0d0d0d-0000-4000-8000-000000000009", true)).toEqual({ ok: false, message: "Сделка не найдена" });
    await expect(setDealNoMarketingAction("1 or 1=1", true)).rejects.toThrow();
    expect(w.marked).toEqual([]);
  });
});
