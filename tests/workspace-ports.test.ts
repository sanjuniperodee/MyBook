import { describe, expect, it } from "vitest";
import { fieldVars } from "@/shared/domain/customFields";

const dealFields = [
  { key: "recipient", label: "Для кого", type: "text", options: [] },
  { key: "event_date", label: "Дата события", type: "date", options: [] },
  { key: "gift", label: "В подарок", type: "checkbox", options: [] },
];

describe("свои поля: переменные шаблонов (fieldVars)", () => {
  it("значения по подписям полей: дата — дд.мм.гггг, флажок — да/нет, пустые и неизвестные пропускаются", () => {
    expect(fieldVars(dealFields, { recipient: "бабушка Роза", event_date: "2026-10-14", gift: false, unknown: "x" })).toEqual({ "Для кого": "бабушка Роза", "Дата события": "14.10.2026", "В подарок": "нет" });
    expect(fieldVars(dealFields, { recipient: "", gift: true, event_date: null })).toEqual({ "В подарок": "да" });
    expect(fieldVars(dealFields, null)).toEqual({});
  });
});
