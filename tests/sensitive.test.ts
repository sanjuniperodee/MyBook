import { describe, expect, it } from "vitest";
import { findSensitive } from "@/modules/messaging/domain/sensitive";

describe("Реквизиты в сообщении менеджера", () => {
  const kinds = (text: string, allowed: string[] = []) => findSensitive(text, allowed).map((f) => f.kind);

  it("чужой номер в любом виде — находка; номер клиента и магазина — нет", () => {
    expect(kinds("Напишите мне на +7 (707) 555-12-34")).toEqual(["phone"]);
    expect(kinds("мой номер 87075551234")).toEqual(["phone"]);
    expect(kinds("ваш номер 8 701 123 45 67 верно?", ["77011234567"])).toEqual([]);
    expect(kinds("наш WhatsApp +7 700 000 00 00", ["+7 700 000 00 00"])).toEqual([]);
  });

  it("карта по контрольной сумме, IBAN KZ, ссылка на перевод Kaspi", () => {
    expect(findSensitive("переведите на 4400 4301 2345 6781")).toEqual([]); // неверная контрольная сумма — не карта, и не телефон
    expect(findSensitive("карта 4111 1111 1111 1111")).toEqual([{ kind: "card", value: "•••• 1111" }]);
    expect(kinds("IBAN KZ86 125K ZT50 0410 0100")).toEqual(["iban"]);
    expect(kinds("оплатите https://kaspi.kz/pay/abc123")).toEqual(["kaspi"]);
  });

  it("суммы, даты и номера заказов — не находки", () => {
    expect(kinds("Итого 20 000 ₸, доставка 2 000 ₸, заказ №1234, до 16.10.2026")).toEqual([]);
    expect(kinds("тарифы: 10 000 20 000")).toEqual([]);
  });

  it("ссылка на заказ с UUID — не номер (правило со {ссылка_на_заказ}), номер рядом с ней — находка", () => {
    // Без исключения «a7012345678b» в UUID читался бы как телефон 701 234 56 78.
    const link = "https://mybooks.kz/orders/5d1c9e2a-4b3f-4c6d-8e9f-a7012345678b";
    expect(kinds(link.replace("orders/5d1c9e2a-4b3f-4c6d-8e9f-a7012345678b", "x a7012345678b"))).toEqual(["phone"]);
    expect(kinds(`Ваш заказ: ${link}`)).toEqual([]);
    expect(kinds(`Ваш заказ: ${link}, звоните +7 707 555 12 34`)).toEqual(["phone"]);
  });
});
