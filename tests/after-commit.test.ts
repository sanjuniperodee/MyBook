import { describe, expect, it } from "vitest";
import { afterCommit, runAfterCommit, txStorage } from "@/shared/infrastructure/database";

// saveSettings внутри чужой транзакции: кэш настроек сбрасывается после её COMMIT, а не до (B7, report.md).
describe("afterCommit", () => {
  it("вне транзакции — сразу; внутри — только после фиксации; ошибка одного не мешает другим", () => {
    const calls: string[] = [];
    afterCommit(() => calls.push("сразу"));
    const ctx: Parameters<typeof txStorage.run>[0] = { tx: {} as never, events: [], aggregates: new Set() };
    txStorage.run(ctx, () => {
      afterCommit(() => {
        throw new Error("сломался");
      });
      afterCommit(() => calls.push("после COMMIT"));
    });
    expect(calls).toEqual(["сразу"]);
    runAfterCommit(ctx);
    expect(calls).toEqual(["сразу", "после COMMIT"]);
  });

  it("откат: отложенное не выполняется (транзакция без runAfterCommit)", () => {
    const calls: string[] = [];
    txStorage.run({ tx: {} as never, events: [], aggregates: new Set() }, () => afterCommit(() => calls.push("x")));
    expect(calls).toEqual([]);
  });
});
