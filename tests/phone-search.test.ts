import { describe, expect, it } from "vitest";
import { phoneTerms } from "@/modules/reporting/infrastructure/phoneSearch";

describe("поиск по телефону (contacts-d1)", () => {
  it("полный номер в любом формате — последние 10 цифр", () => {
    expect(phoneTerms("8 701 123 45 67")).toEqual({ key: "7011234567" });
    expect(phoneTerms("+7 (701) 123-45-67")).toEqual({ key: "7011234567" });
    expect(phoneTerms("77011234567")).toEqual({ key: "7011234567" });
  });

  it("кусок номера — подстрокой, с «8» в начале — ещё и как с «7»; меньше 4 цифр и текст — не телефон", () => {
    expect(phoneTerms("123 45")).toEqual({ parts: ["12345"] });
    expect(phoneTerms("8701")).toEqual({ parts: ["8701", "7701"] });
    expect(phoneTerms("12")).toBeNull();
    expect(phoneTerms("Айгерим")).toBeNull();
  });
});
