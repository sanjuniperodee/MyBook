import { describe, expect, it } from "vitest";
import { responseStats, type ResponsePair } from "@/modules/reporting/ui/response-stats";
import { parseWorkHours } from "@/shared/domain/schedule";

// Честная скорость ответа (chats-1, analytics-2, chats-d1, analytics-d1, analytics-d2).
const hours = parseWorkHours('{"days":[1,2,3,4,5,6,7],"from":"09:00","to":"21:00"}');
const at = (s: string) => new Date(s);
const pair = (p: Omit<Partial<ResponsePair>, "asked"> & { asked: string }): ResponsePair => ({ conversationId: "c", human: null, author: null, bot: null, ...p, asked: at(p.asked) });

describe("скорость ответа людей в рабочих минутах", () => {
  const now = at("2026-10-01T10:00:00Z"); // 15:00 по Алматы
  const pairs: ResponsePair[] = [
    // Днём: менеджер m1 ответил за 10 и 30 минут.
    pair({ conversationId: "a", asked: "2026-10-01T05:00:00Z", human: at("2026-10-01T05:10:00Z"), author: "m1" }),
    pair({ conversationId: "b", asked: "2026-10-01T06:00:00Z", human: at("2026-10-01T06:30:00Z"), author: "m1" }),
    // Ночью в 23:00, бот ответил сразу, человек — в 09:05: ожидание 5 рабочих минут, а не 10 часов.
    pair({ conversationId: "night", asked: "2026-09-30T18:00:00Z", bot: at("2026-09-30T18:01:00Z"), human: at("2026-10-01T04:05:00Z"), author: null }),
    // Без ответа людей с 13:00 — 2 часа, хотя правило уже написало клиенту.
    pair({ conversationId: "wait", asked: "2026-10-01T08:00:00Z", bot: at("2026-10-01T08:02:00Z") }),
  ];
  const s = responseStats(pairs, hours, 15, now, "Asia/Almaty");

  it("итог — по всем людям (а не группа «без автора»): медиана, доля в норматив, без ответа", () => {
    expect(s.total).toMatchObject({ asked: 4, answered: 3, unanswered: 1, median: 10 });
    expect(s.total.inSla).toBeCloseTo(2 / 3);
  });

  it("по авторам; ответы с телефона без держателя — отдельной группой", () => {
    expect(s.byAuthor.get("m1")).toMatchObject({ answered: 2, median: 20, inSla: 0.5 });
    expect(s.byAuthor.get(null)).toMatchObject({ answered: 1, median: 5, inSla: 1 });
  });

  it("бот и правила — отдельной цифрой и только когда ответили раньше человека", () => {
    expect(s.bot).toEqual({ first: 2, median: 1.5 });
  });

  it("дольше всех ждали — сверху, без ответа — до сих пор", () => {
    expect(s.longest.map((w) => [w.conversationId, w.minutes, w.answered])).toEqual([
      ["wait", 120, false],
      ["b", 30, true],
      ["a", 10, true],
      ["night", 5, true],
    ]);
  });
});

describe("ответ с телефона магазина — тому, у кого телефон (analytics-1, analytics-d3)", () => {
  it("эхо записывается с держателем телефона; без отметки держателя — ни на кого", async () => {
    const { setup, inbound } = await import("./doubles/botHarness");
    const held = setup({ phoneHolder: { id: "m7", name: "Айгерим" } });
    await held.service.ingest(inbound({ text: "Здравствуйте" }));
    await held.service.ingest(inbound({ externalId: "echo-1", isEcho: true, text: "Добрый день!", contactName: "" }));
    expect(held.msgs.find((m) => m.externalId === "echo-1")).toMatchObject({ dir: "out", attributedTo: "m7" });
    const free = setup();
    await free.service.ingest(inbound({ text: "Здравствуйте" }));
    await free.service.ingest(inbound({ externalId: "echo-2", isEcho: true, text: "Добрый день!", contactName: "" }));
    expect(free.msgs.find((m) => m.externalId === "echo-2")?.attributedTo).toBeNull();
  });
});

describe("ответ с телефона без отметки держателя принимает заявку (chats-d2)", () => {
  it("заявка становится взятой на её ответственного — круг её больше не отнимет", async () => {
    const { setup, inbound } = await import("./doubles/botHarness");
    const t = setup();
    await t.service.ingest(inbound({ text: "Здравствуйте" }));
    const conv = t.conv();
    conv.assigneeId = "m3";
    const deal = t.deals.find((d) => d.id === conv.dealId)!;
    expect(deal.unsorted).toBe(true);
    await t.service.ingest(inbound({ externalId: "echo-9", isEcho: true, text: "Добрый день!", contactName: "" }));
    expect(deal.unsorted).toBe(false);
  });
});
