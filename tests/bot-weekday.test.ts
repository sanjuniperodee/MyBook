import { describe, expect, it } from "vitest";
import { fixWeekdays } from "@/modules/messaging/domain/botWeekday";

// 24.11.2026 — вторник; 1 декабря 2026 — тоже вторник, 30 ноября — понедельник.
const today = "2026-11-24";

describe("бот: день недели рядом с датой — по календарю (живая проверка 24.11)", () => {
  it("русский: неверный день заменяется, падеж и предлог сохраняются", () => {
    expect(fixWeekdays("Хорошо, тогда напишу вам в понедельник, 1 декабря 😊", today)).toEqual({ text: "Хорошо, тогда напишу вам во вторник, 1 декабря 😊", fixed: ["понедельник → вторник (2026-12-01)"] });
    expect(fixWeekdays("Напишу в среду, 30 ноября", today).text).toBe("Напишу в понедельник, 30 ноября");
    expect(fixWeekdays("Допишите до 28 ноября (пятница)", today).text).toBe("Допишите до 28 ноября (суббота)");
    expect(fixWeekdays("Пятница, 27 ноября — последний день", today).fixed).toEqual([]);
  });
  it("казахский, узбекский, английский", () => {
    expect(fixWeekdays("Жақсы, онда дүйсенбі, 1 желтоқсан жазамын 😊", today).text).toBe("Жақсы, онда сейсенбі, 1 желтоқсан жазамын 😊");
    expect(fixWeekdays("Yaxshi, unda dushanba, 1-dekabr yozaman", today).text).toBe("Yaxshi, unda seshanba, 1-dekabr yozaman");
    expect(fixWeekdays("I’ll write to you on Monday, December 1", today).text).toBe("I’ll write to you on Tuesday, December 1");
    expect(fixWeekdays("See you on 1 December, Tuesday", today).fixed).toEqual([]);
  });
  it("без даты рядом и прошедшая дата — следующего года; верный текст не трогается", () => {
    expect(fixWeekdays("Напишу в понедельник 🙂", today).fixed).toEqual([]);
    expect(fixWeekdays("в пятницу, 20 ноября", today).text).toBe("в субботу, 20 ноября"); // 20.11.2027 — суббота
    expect(fixWeekdays("Успеваем к 15 декабря, допишите до 8 декабря", today)).toEqual({ text: "Успеваем к 15 декабря, допишите до 8 декабря", fixed: [] });
  });
});
