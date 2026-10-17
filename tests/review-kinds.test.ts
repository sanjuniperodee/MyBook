import { describe, expect, it } from "vitest";
import { messagesFor } from "@/i18n/messages";
import { getThemes } from "@/lib/content/themes";

describe("отзывы и письма по видам книг", () => {
  it("витрина и админка отзывов подписывают все шесть тем на обоих языках", () => {
    for (const lang of ["ru", "kk"] as const) {
      const labels = messagesFor(lang).review.showcase.theme;
      for (const t of getThemes(lang)) expect(labels[t.id], `${lang}:${t.id}`).toBeTruthy();
    }
  });

  it("форма отзыва: у автобиографии и своей книги нет «вручения» и «получателя»", () => {
    for (const lang of ["ru", "kk"] as const) {
      const r = messagesFor(lang).review;
      expect(r.textHighAutobiography).not.toBe(r.textHigh);
      expect(r.textHighBlank).not.toBe(r.textHigh);
    }
    const ru = messagesFor("ru").review;
    for (const text of [ru.textHighAutobiography, ru.textHighBlank, ru.photoHintOwn]) expect(text).not.toMatch(/вручени|получател/i);
  });

  it("письмо о доставке: для своей книги и автобиографии — без «подарка»", () => {
    const ru = messagesFor("ru").mail.order.delivered;
    expect(ru.text).toContain("подарок");
    expect(ru.textOwn).not.toContain("подарок");
    const kk = messagesFor("kk").mail.order.delivered;
    expect(kk.textOwn).not.toBe(kk.text);
  });
});
