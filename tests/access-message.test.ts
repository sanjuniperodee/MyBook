import { describe, expect, it } from "vitest";
import { accessMessage, displayLogin } from "@/app/admin/clients/new/access-message";
import { generateAccessPassword } from "@/lib/access-password";

describe("доступ клиенту", () => {
  it("пароль: нужной длины, без похожих символов, каждый раз новый", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = generateAccessPassword();
      expect(p).toHaveLength(10);
      expect(p).toMatch(/^[a-zA-Z2-9]+$/);
      expect(p).not.toMatch(/[0OIl1]/);
      seen.add(p);
    }
    expect(seen.size).toBeGreaterThan(195);
    expect(generateAccessPassword(14)).toHaveLength(14);
  });

  it("логин для показа: телефон читаемо, почта как есть", () => {
    expect(displayLogin("77758613077")).toBe("+7 775 861 30 77");
    expect(displayLogin("ayan@mail.kz")).toBe("ayan@mail.kz");
  });

  it("сообщение клиенту: по-русски и по-казахски, с логином, паролем и ссылкой", () => {
    const base = { name: "Насиба", login: "77758613077", password: "Abc23xyz9Q", loginUrl: "https://site.kz/login" };
    const ru = accessMessage({ ...base, locale: "ru" });
    expect(ru).toContain("Здравствуйте, Насиба!");
    expect(ru).toContain("Логин: +7 775 861 30 77");
    expect(ru).toContain("Пароль: Abc23xyz9Q");
    expect(ru).toContain("https://site.kz/login");
    const kk = accessMessage({ ...base, locale: "kk" });
    expect(kk).toContain("Сәлеметсіз бе, Насиба!");
    expect(kk).toContain("Құпиясөз: Abc23xyz9Q");
    expect(accessMessage({ ...base, name: "", locale: "ru" }).startsWith("Здравствуйте!")).toBe(true);
  });
});
