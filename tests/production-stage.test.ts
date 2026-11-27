import { describe, expect, it } from "vitest";
import { productionMove, productionStage, type ProductionFacts } from "@/modules/ordering/domain/productionStage";

const f = (p: Partial<ProductionFacts>): ProductionFacts => ({ status: "paid", layoutRequired: true, layoutApprovedAt: null, bookEditing: false, printedAt: null, ...p });

describe("Этап производства заказа", () => {
  it("выводится из статуса, согласования, правок и отметки «книга готова»", () => {
    expect(productionStage(f({ status: "pending_payment" }))).toBe("awaiting_payment");
    expect(productionStage(f({}))).toBe("approval");
    expect(productionStage(f({ bookEditing: true }))).toBe("revisions");
    expect(productionStage(f({ layoutApprovedAt: new Date() }))).toBe("queued");
    expect(productionStage(f({ layoutRequired: false }))).toBe("queued");
    expect(productionStage(f({ status: "in_production" }))).toBe("printing");
    expect(productionStage(f({ status: "in_production", printedAt: new Date() }))).toBe("printed");
    expect(productionStage(f({ status: "in_production", bookEditing: true }))).toBe("revisions");
    expect(productionStage(f({ status: "shipped" }))).toBe("shipped");
    expect(productionStage(f({ status: "cancelled" }))).toBeNull();
  });

  it("перенос — настоящие действия: правки открывают книгу, согласование закрывает, «готова» — отметка в печати", () => {
    expect(productionMove(f({}), "revisions")).toEqual({ steps: [{ kind: "book", open: true }] });
    expect(productionMove(f({ bookEditing: true }), "approval")).toEqual({ steps: [{ kind: "book", open: false }] });
    expect(productionMove(f({ layoutApprovedAt: new Date() }), "printed")).toEqual({ steps: [{ kind: "status", to: "in_production" }, { kind: "printed", ready: true }] });
    expect(productionMove(f({ status: "in_production", printedAt: new Date() }), "printing")).toEqual({ steps: [{ kind: "printed", ready: false }] });
    expect(productionMove(f({ status: "in_production" }), "shipped")).toEqual({ steps: [{ kind: "status", to: "shipped" }] });
  });

  it("в очередь и в печать — только согласованный макет; неоплаченный дальше правок не двигаем", () => {
    expect(productionMove(f({}), "queued")).toHaveProperty("refusal");
    expect(productionMove(f({ bookEditing: true, layoutApprovedAt: new Date() }), "queued")).toHaveProperty("refusal");
    expect(productionMove(f({ bookEditing: true }), "printing")).toHaveProperty("refusal");
    expect(productionMove(f({ status: "pending_payment" }), "printing")).toHaveProperty("refusal");
    expect(productionMove(f({ status: "pending_payment" }), "revisions")).toEqual({ steps: [{ kind: "book", open: true }] });
    expect(productionMove(f({}), "awaiting_payment")).toHaveProperty("refusal");
  });
});
