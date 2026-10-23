import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as exportPayments } from "@/app/api/admin/export/payments/route";
import { fake, owner, resetContainer, resetRequest, signIn } from "./doubles/web";

vi.mock("next/headers", async () => (await import("./doubles/web")).nextHeaders);
vi.mock("next/navigation", async () => (await import("./doubles/web")).nextNavigation);
vi.mock("@/server/container", async () => (await import("./doubles/web")).containerModule);
vi.mock("@/shared/infrastructure/database", () => ({ rootDb: {}, executor: () => ({}) }));

// «Поступления денег» (analytics-d6): успешная сделка без платежа подписана как договорённость, а не как деньги.
beforeEach(() => {
  resetRequest();
  resetContainer();
  fake.reporting = {
    paymentsExport: async () => [
      { at: "2026-10-20 12:00", amount: 15000, kind: "payment", type: "предоплата", ref: " сделка №7", client: "Айгерим", phone: "", manager: "Надя", receipt: "да" },
      { at: "2026-10-21 12:00", amount: 30000, kind: "deal", type: "", ref: " сделка №8", client: "Асель", phone: "", manager: "Надя", receipt: "" },
    ],
  };
});

describe("выгрузка поступлений", () => {
  it("платёж — «платёж менеджеру», сделка без платежа — с подписью «денег в журнале нет»", async () => {
    signIn(owner);
    const res = await exportPayments(new Request("http://localhost/api/admin/export/payments?days=30"), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const [, paid, agreed] = (await res.text()).replace(/^﻿/, "").split(/\r?\n/);
    expect(paid).toContain("платёж менеджеру");
    expect(agreed).toContain("успешная сделка без платежа (сумма договорённости, денег в журнале нет)");
  });
});
