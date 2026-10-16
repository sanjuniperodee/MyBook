import { describe, expect, it } from "vitest";
import { Lru } from "@/lib/lru";

describe("Lru", () => {
  it("держит не больше limit записей и вытесняет самую давнюю", () => {
    const c = new Lru<string, number>(2);
    c.set("a", 1).set("b", 2).set("c", 3);
    expect([...c.keys()]).toEqual(["b", "c"]);
    expect(c.get("a")).toBeUndefined();
    expect(c.size).toBe(2);
  });

  it("обращение освежает запись: вытесняется та, к которой дольше не обращались", () => {
    const c = new Lru<string, number>(2);
    c.set("a", 1).set("b", 2);
    expect(c.get("a")).toBe(1);
    c.set("c", 3);
    expect([...c.keys()]).toEqual(["a", "c"]);
  });

  it("повторная запись ключа не растит кэш и освежает его", () => {
    const c = new Lru<string, number>(2);
    c.set("a", 1).set("b", 2).set("a", 10).set("c", 3);
    expect(c.get("a")).toBe(10);
    expect(c.has("b")).toBe(false);
  });

  it("хранит и ложные значения, delete убирает запись", () => {
    const c = new Lru<string, number>(3);
    c.set("zero", 0);
    expect(c.get("zero")).toBe(0);
    expect(c.delete("zero")).toBe(true);
    expect(c.has("zero")).toBe(false);
  });

  it("предел меньше 1 — ошибка", () => {
    expect(() => new Lru(0)).toThrow();
  });

  it("peek читает без освежения", () => {
    const c = new Lru<string, number>(2);
    c.set("a", 1).set("b", 2);
    expect(c.peek("a")).toBe(1);
    c.set("c", 3);
    expect(c.has("a")).toBe(false);
  });
});
