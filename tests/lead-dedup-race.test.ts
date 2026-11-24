import { describe, expect, it } from "vitest";
import { keyedLock } from "@/shared/application";
import { inbound, setup } from "./doubles/botHarness";

describe("Новая заявка: два сообщения клиента в одну секунду — одна сделка (24.11, Д1686/Д1687)", () => {
  it("второе сообщение ждёт первое и попадает в его сделку", async () => {
    const { service, deals, convs } = setup();
    await Promise.all([service.ingest(inbound({ text: "Здравствуйте" })), service.ingest(inbound({ text: "Сколько стоит книга?" }))]);
    expect(deals).toHaveLength(1);
    expect([...convs.values()].map((c) => c.dealId)).toEqual([deals[0].id]);
  });
});

describe("keyedLock", () => {
  it("один ключ — по очереди, разные — параллельно, ошибка не останавливает очередь", async () => {
    const withLock = keyedLock();
    const log: string[] = [];
    const step = (name: string, ms: number, fail = false) => async () => {
      log.push(`${name}:start`);
      await new Promise((r) => setTimeout(r, ms));
      log.push(`${name}:end`);
      if (fail) throw new Error(name);
      return name;
    };
    const res = await Promise.allSettled([withLock("a", step("a1", 10, true)), withLock("a", step("a2", 1)), withLock("b", step("b1", 1))]);
    expect(res.map((r) => r.status)).toEqual(["rejected", "fulfilled", "fulfilled"]);
    expect(log.indexOf("a2:start")).toBeGreaterThan(log.indexOf("a1:end"));
    expect(log.indexOf("b1:start")).toBeLessThan(log.indexOf("a1:end"));
  });
});
