import { describe, expect, it } from "vitest";
import { appendPhrase, DraftQueue, sendDraft, type Patch } from "@/components/editor/questions/draft";

describe("редактор: очередь несохранённых правок", () => {
  it("правки одного вопроса сливаются, свежие поверх старых", () => {
    const q = new DraftQueue();
    q.set("a", { answer: "1" });
    q.set("a", { displayText: "Заголовок" });
    q.set("a", { answer: "2" });
    expect(q.take()).toEqual([["a", { answer: "2", displayText: "Заголовок" }]]);
    expect(q.size).toBe(0);
  });

  it("отправляет по одной, в порядке первых правок", async () => {
    const q = new DraftQueue();
    q.set("a", { answer: "1" });
    q.set("b", { hideHeading: true });
    q.set("a", { answer: "2" });
    const sent: [string, Patch][] = [];
    await sendDraft(q, async (id, patch) => void sent.push([id, patch]));
    expect(sent).toEqual([
      ["a", { answer: "2" }],
      ["b", { hideHeading: true }],
    ]);
    expect(q.size).toBe(0);
  });

  it("упавшая правка возвращается в очередь, а то, что успели изменить во время отправки, остаётся поверх", async () => {
    const q = new DraftQueue();
    q.set("a", { answer: "старый", displayText: "Заголовок" });
    await expect(
      sendDraft(q, async () => {
        q.set("a", { answer: "новый" });
        throw new Error("сеть");
      }),
    ).rejects.toThrow("сеть");
    expect(q.take()).toEqual([["a", { answer: "новый", displayText: "Заголовок" }]]);
  });

  it("баг: правки других вопросов из той же пачки после упавшей теряются", async () => {
    const q = new DraftQueue();
    q.set("a", { answer: "1" });
    q.set("b", { answer: "2" });
    await expect(sendDraft(q, async (id) => (id === "a" ? Promise.reject(new Error("сеть")) : undefined))).rejects.toThrow();
    expect(q.take()).toEqual([["a", { answer: "1" }]]);
  });
});

describe("редактор: диктовка дописывает фразу", () => {
  it("к пустому ответу — с заглавной, к тексту — через пробел, после пробела — без второго", () => {
    expect(appendPhrase("", "привет")).toBe("Привет");
    expect(appendPhrase("Мы", "познакомились")).toBe("Мы познакомились");
    expect(appendPhrase("Мы ", "познакомились")).toBe("Мы познакомились");
    expect(appendPhrase("Мы\n", "познакомились")).toBe("Мы\nпознакомились");
  });
});
