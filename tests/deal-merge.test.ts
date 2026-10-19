import { beforeEach, describe, expect, it, vi } from "vitest";
import { SalesError } from "@/modules/sales/domain";
import { fake, owner, resetContainer, resetRequest, signIn } from "./doubles/web";

vi.mock("next/headers", async () => (await import("./doubles/web")).nextHeaders);
vi.mock("next/navigation", async () => (await import("./doubles/web")).nextNavigation);
vi.mock("next/cache", async () => (await import("./doubles/web")).nextCache);
vi.mock("@/server/container", async () => (await import("./doubles/web")).containerModule);
vi.mock("@/shared/infrastructure/database", () => ({ rootDb: {}, executor: () => ({}) }));
vi.mock("@/modules/workspace", () => ({ notify: async () => {}, notifyMentions: async () => {}, staffNotifier: { notifyAllWith: async () => {} }, listFields: async () => [], readFieldValues: () => ({}) }));

const { mergeDealAction } = await import("@/app/admin/deals/actions");

const TARGET = "0d0d0d0d-0000-4000-8000-0000000000a1";
const SOURCE = "0d0d0d0d-0000-4000-8000-0000000000a2";

/** Слияние из карточки: закрытый дубль — понятный текст, а не ошибка сервера; снимки «до» — в журнал, без контактов. */
describe("mergeDealAction", () => {
  let audits: { action: string; entityId?: string | null; details?: Record<string, unknown> }[];
  let merge: () => Promise<unknown>;

  beforeEach(() => {
    resetRequest();
    resetContainer();
    audits = [];
    const snap = (id: string, number: number) => ({ id, number, title: `Сделка ${number}`, stageId: "s-open", assigneeId: null, clientId: null, orderId: null, amount: 15000, contactName: "Айгерим", contactPhone: "77011234567", contactEmail: "a@b.kz", extraPhones: ["77079998877"], customFields: { occasion: "Юбилей" }, utm: { source: "instagram" }, tags: [] });
    merge = async () => ({ target: snap(TARGET, 7), source: snap(SOURCE, 8) });
    fake.sales = { deals: { findById: async (id: string) => snap(id, id === TARGET ? 7 : 8), merge: () => merge() } };
    fake.access = { ...fake.access, audit: { record: async (a: (typeof audits)[number]) => void audits.push(a) } };
    signIn(owner);
  });

  it("закрытый источник: текст для сотрудника из словаря, в журнал ничего не пишется", async () => {
    merge = async () => {
      throw new SalesError("mergeClosed", undefined, [8]);
    };
    expect(await mergeDealAction(TARGET, SOURCE)).toEqual({ error: expect.stringContaining("Сделка №8 закрыта") });
    expect(audits).toEqual([]);
  });

  it("слияние: в журнале deal.merge — номер дубля и снимки обеих сделок «до» без телефонов и e-mail", async () => {
    expect(await mergeDealAction(TARGET, SOURCE)).toBeUndefined();
    expect(audits).toHaveLength(1);
    const { action, entityId, details } = audits[0];
    expect({ action, entityId }).toEqual({ action: "deal.merge", entityId: TARGET });
    expect(details).toMatchObject({ merged: 8, before: { target: { number: 7, amount: 15000 }, source: { number: 8, customFields: { occasion: "Юбилей" }, utm: { source: "instagram" } } } });
    expect(JSON.stringify(details)).not.toMatch(/77011234567|77079998877|a@b\.kz/);
  });

  it("чужая ошибка (не правило продаж) пробрасывается", async () => {
    merge = async () => {
      throw new Error("db down");
    };
    await expect(mergeDealAction(TARGET, SOURCE)).rejects.toThrow("db down");
  });
});
