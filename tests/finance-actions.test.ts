import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/server/access";
import { resolveFinanceIssueAction, reviewDealPaymentAction, undoFinanceResolutionAction } from "@/app/admin/finance/actions";
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

describe("«Финансы» → «Отметить решённым» и «Отменить решение»", () => {
  let audits: Record<string, unknown>[];
  let saved: Record<string, unknown>[];
  let undone: string[];
  const RES = "0d0d0d0d-0000-4000-8000-000000000003";
  /** Сделка в отказе с 6 000 ₸ — случай dl:<сделка> на 6 000. */
  const lostDeal = { id: DEAL, number: 12, client: "Айжан", managerId: null, agreed: 10000, paid: 6000, payments: 1, plan: null, source: "manual", stageKind: "lost", milestone: null, hasClient: true, eventDate: null, book: null, invoice: null, order: null };

  beforeEach(() => {
    resetRequest();
    resetContainer();
    audits = [];
    saved = [];
    undone = [];
    (fake.access as { audit: unknown }).audit = { record: async (e: Record<string, unknown>) => void audits.push(e) };
    fake.reporting = { financeIssues: async () => ({ deals: [lostDeal], orders: [], unrecorded: [] }) };
    fake.workspace = {
      financeResolutions: {
        // Одно действующее решение на ключ и сумму: повтор — null.
        resolve: async (r: Record<string, unknown>) => {
          if (saved.some((x) => x.key === r.key && x.amount === r.amount)) return null;
          saved.push(r);
          return { id: RES };
        },
        find: async (id: string) => (id === RES && !undone.includes(id) ? { id, key: `dl:${DEAL}`, amount: 6000, managerId: null } : null),
        undo: async (id: string) => (undone.includes(id) ? null : (undone.push(id), { id })),
      },
    };
  });

  it("руководитель отмечает случай с комментарием — снимок случая и журнал действий; повтор — «уже отмечен»", async () => {
    signIn(owner);
    expect(await resolveFinanceIssueAction(`dl:${DEAL}`, 6000, "  вернули наличными  ")).toEqual({ ok: "Отмечено решённым" });
    expect(saved).toEqual([{ key: `dl:${DEAL}`, amount: 6000, note: "вернули наличными", title: "Сделка в отказе — деньги клиента у нас", ref: "Сделка Д12", client: "Айжан", href: `/admin/deals/${DEAL}`, managerId: null, resolvedById: owner.id }]);
    expect(audits).toEqual([{ actorId: owner.id, action: "finance.issue_resolve", entity: "deal", entityId: DEAL, details: { resolution: RES, key: `dl:${DEAL}`, kind: "deal_lost", amount: 6000, note: "вернули наличными" } }]);
    expect(await resolveFinanceIssueAction(`dl:${DEAL}`, 6000, "ещё раз")).toEqual({ error: "Случай уже отмечен решённым" });
    expect(audits).toHaveLength(1);
  });

  it("сумма уже другая, случая нет, короткий комментарий, мусорный ключ — отказ без записи", async () => {
    signIn(owner);
    expect(await resolveFinanceIssueAction(`dl:${DEAL}`, 5000, "вернули")).toEqual({ error: "Сумма случая изменилась — обновите страницу" });
    expect(await resolveFinanceIssueAction(`do:${DEAL}`, 6000, "вернули")).toEqual({ error: "Случай уже закрыт или недоступен — обновите страницу" });
    expect(await resolveFinanceIssueAction(`dl:${DEAL}`, 6000, "ok")).toEqual({ error: "Напишите, как решили: от 3 символов" });
    expect(await resolveFinanceIssueAction("dl:42", 6000, "вернули")).toEqual({ error: "Случай не найден" });
    expect([saved, audits]).toEqual([[], []]);
  });

  it("без аналитики (менеджер) и не сотрудник — ForbiddenError", async () => {
    signIn(anna);
    expect(await thrown(resolveFinanceIssueAction(`dl:${DEAL}`, 6000, "вернули"))).toBeInstanceOf(ForbiddenError);
    expect(await thrown(undoFinanceResolutionAction(RES))).toBeInstanceOf(ForbiddenError);
    signIn(client);
    expect(await thrown(resolveFinanceIssueAction(`dl:${DEAL}`, 6000, "вернули"))).toBeInstanceOf(ForbiddenError);
    expect(saved).toEqual([]);
  });

  it("отмена решения — журнал действий; второй раз — «уже отменено»", async () => {
    signIn(owner);
    expect(await undoFinanceResolutionAction(RES)).toEqual({ ok: "Решение отменено" });
    expect(audits).toEqual([{ actorId: owner.id, action: "finance.issue_unresolve", entity: "deal", entityId: DEAL, details: { resolution: RES, key: `dl:${DEAL}`, amount: 6000 } }]);
    expect(await undoFinanceResolutionAction(RES)).toEqual({ error: "Решение не найдено или уже отменено" });
    expect(await undoFinanceResolutionAction("42")).toEqual({ error: "Решение не найдено" });
  });
});
