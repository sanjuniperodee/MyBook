import { describe, expect, it } from "vitest";
import { toVcard, vcardName } from "@/lib/vcard";

// Контакты клиентов для телефона магазина (contacts-10, platform-10).
describe("vCard для адресной книги телефона магазина", () => {
  it("подпись: имя, номер сделки и повод; без имени — номер", () => {
    expect(vcardName({ name: "Айгерим", dealNumber: 123, occasion: "День рождения", phone: "77011234567" })).toBe("Айгерим · MB123 · День рождения");
    expect(vcardName({ name: " ", dealNumber: null, occasion: null, phone: "77011234567" })).toBe("+77011234567");
  });

  it("формат 3.0: CRLF, экранирование, основной и доп. телефоны; без телефона — не попадает", () => {
    const vcf = toVcard([
      { name: "Айгерим, мама; Алматы", phones: ["77011234567", "77029998877"], note: "MyBooks CRM" },
      { name: "Без номера", phones: [] },
    ]);
    expect(vcf).toBe(
      ["BEGIN:VCARD", "VERSION:3.0", "FN:Айгерим\\, мама\\; Алматы", "N:;Айгерим\\, мама\\; Алматы;;;", "TEL;TYPE=CELL,PREF:+77011234567", "TEL;TYPE=CELL:+77029998877", "NOTE:MyBooks CRM", "END:VCARD", ""].join("\r\n"),
    );
    expect(toVcard([])).toBe("");
  });
});
