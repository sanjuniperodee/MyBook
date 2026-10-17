import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/server/access";
import { reviewDealPaymentAction } from "@/app/admin/finance/actions";
import { anna, client, fake, owner, resetContainer, resetRequest, signIn } from "./doubles/web";

vi.mock("next/headers", async () => (await import("./doubles/web")).nextHeaders);
vi.mock("next/navigation", async () => (await import("./doubles/web")).nextNavigation);
vi.mock("next/cache", async () => (await import("./doubles/web")).nextCache);
vi.mock("@/server/container", async () => (await import("./doubles/web")).containerModule);

const PAYMENT = "0d0d0d0d-0000-4000-8000-000000000001";
const DEAL = "0d0d0d0d-0000-4000-8000-000000000002";

const thrown = (p: Promise<unknown>) => p.then(() => undefined, (e: unknown) => e);

describe("«Финансы» → «Проверено» для платежа сделки", () => {
  let audits: Record<string, unknown>[];
  let reviewed: [string, string][];

  beforeEach(() => {
    resetRequest();
    resetContainer();
    audits = [];
    reviewed = [];
    (fake.access as { audit: unknown }).audit = { record: async (e: Record<string, unknown>) => void audits.push(e) };
    fake.sales = {
      payments: {
        // Двойник хранилища: первый раз отмечает, второй — уже проверен (null).
        review: async (id: string, by: string) => {
          if (reviewed.some(([x]) => x === id)) return null;
          reviewed.push([id, by]);
          return { id, dealId: DEAL, amount: 10000, kind: "prepayment" };
        },
        find: async () => ({ id: PAYMENT, dealId: DEAL }),
      },
      deals: { findById: async () => ({ id: DEAL, assigneeId: "someone" }) },
    };
  });

  it("руководитель отмечает — запись в журнал действий; повторно — «уже проверен», без журнала", async () => {
    signIn(owner);
    expect(await reviewDealPaymentAction(PAYMENT)).toEqual({ ok: "Отмечено: проверено" });
    expect(reviewed).toEqual([[PAYMENT, owner.id]]);
    expect(audits).toEqual([{ actorId: owner.id, action: "payment.review", entity: "deal", entityId: DEAL, details: { payment: PAYMENT, amount: 10000, kind: "prepayment" } }]);
    expect(await reviewDealPaymentAction(PAYMENT)).toEqual({ error: "Платёж не найден, онлайн или уже проверен" });
    expect(audits).toHaveLength(1);
  });

  it("без team.manage (менеджер) и не сотрудник — ForbiddenError, ничего не отмечено", async () => {
    signIn(anna);
    expect(await thrown(reviewDealPaymentAction(PAYMENT))).toBeInstanceOf(ForbiddenError);
    signIn(client);
    expect(await thrown(reviewDealPaymentAction(PAYMENT))).toBeInstanceOf(ForbiddenError);
    expect(reviewed).toEqual([]);
    expect(audits).toEqual([]);
  });

  it("не UUID — ошибка разбора zod до обращения к базе", async () => {
    signIn(owner);
    expect(await thrown(reviewDealPaymentAction("42"))).toMatchObject({ name: "ZodError" });
    expect(reviewed).toEqual([]);
  });
});
