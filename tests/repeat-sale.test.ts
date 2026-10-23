import { describe, expect, it } from "vitest";
import { repeatSale, type RepeatSaleDeps } from "@/server/repeat-sale";

// Ручная добивка к праздникам без рассылки (contacts-14).
function deps(over: Partial<RepeatSaleDeps> = {}) {
  const log: string[] = [];
  const people: Record<string, Awaited<ReturnType<RepeatSaleDeps["client"]>>> = {
    a: { id: "a", name: "Айгерим Сейткали", email: "a@test.kz", phone: "77011112233", managerId: "m1", locale: "kk" },
    b: { id: "b", name: "Олег", email: "b@test.kz", phone: "77022223344", managerId: null, locale: "ru" },
    stop: { id: "stop", name: "Стоп", email: "s@test.kz", phone: "77033334455", managerId: null },
    busy: { id: "busy", name: "Занят", email: "z@test.kz", phone: "77044445566", managerId: null },
  };
  const d: RepeatSaleDeps = {
    client: async (id) => people[id] ?? null,
    noMarketing: async (phone) => phone === "77033334455",
    hasOpenDeal: async (id) => id === "busy",
    createDeal: async (i) => (log.push(`deal:${i.clientId}:${i.assigneeId}:${i.title}`), { id: `d-${i.clientId}`, assigneeId: i.assigneeId }),
    addTag: async (id, tag) => void log.push(`tag:${id}:${tag}`),
    draft: async (id, _c, text) => void log.push(`draft:${id}:${text}`),
    task: async (t) => void log.push(`task:${t.dealId}:${t.assigneeId}:${t.title}`),
    ...over,
  };
  return { d, log };
}

describe("ручная добивка: «Повторная продажа» по выбранным клиентам (contacts-14)", () => {
  it("сделка, готовый текст на языке клиента с его именем, тег и задача; ответственный клиента — иначе тот, кто запустил", async () => {
    const { d, log } = deps();
    const res = await repeatSale(d, { clientIds: ["a", "b"], title: "Повторная продажа: 14 февраля", text: "{имя}, скоро 14 февраля!", textKk: "{имя}, жақында 14 ақпан!", tag: "14фев", actorId: "boss" });
    expect(res).toEqual({ created: 2, skipped: { noMarketing: 0, openDeal: 0, notFound: 0 } });
    expect(log).toEqual([
      "deal:a:m1:Повторная продажа: 14 февраля",
      "tag:d-a:14фев",
      "draft:d-a:Айгерим, жақында 14 ақпан!",
      "task:d-a:m1:Написать: Повторная продажа: 14 февраля",
      "deal:b:boss:Повторная продажа: 14 февраля",
      "tag:d-b:14фев",
      "draft:d-b:Олег, скоро 14 февраля!",
      "task:d-b:boss:Написать: Повторная продажа: 14 февраля",
    ]);
  });

  it("пропускает «не писать первым», тех, с кем уже работают, и невидимых; казахский пуст — русский текст", async () => {
    const { d, log } = deps();
    const res = await repeatSale(d, { clientIds: ["stop", "busy", "nobody", "a"], title: "Повторная продажа: 8 Марта", text: "{имя}, скоро 8 Марта", textKk: " ", actorId: "boss" });
    expect(res).toEqual({ created: 1, skipped: { noMarketing: 1, openDeal: 1, notFound: 1 } });
    expect(log.filter((l) => l.startsWith("draft"))).toEqual(["draft:d-a:Айгерим, скоро 8 Марта"]);
    expect(log.some((l) => l.startsWith("tag"))).toBe(false);
  });

  it("не больше 200 за раз", async () => {
    const created: string[] = [];
    const { d } = deps({ client: async (id) => ({ id, name: "К", email: `${id}@t.kz`, phone: null, managerId: null }), createDeal: async (i) => (created.push(i.clientId), { id: i.clientId, assigneeId: null }) });
    await repeatSale(d, { clientIds: Array.from({ length: 250 }, (_, i) => `c${i}`), title: "Повторная продажа", text: "Текст клиенту", actorId: "boss" });
    expect(created).toHaveLength(200);
  });
});
