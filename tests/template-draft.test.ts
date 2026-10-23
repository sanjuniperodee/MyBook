import { describe, expect, it } from "vitest";
import { parseTemplateDraft, substituteKnown, titleFromText } from "@/modules/assistant/domain";

describe("Шаблон из сообщения", () => {
  it("известные данные клиента заменяются подстановками, слово целиком и без учёта регистра", () => {
    const r = substituteKnown("Айдана, ваш заказ 1042 готов. Менеджер Марат на связи. Айданаевна — не имя.", { name: "Айдана", manager: "Марат", order: 1042 });
    expect(r.text).toBe("{имя}, ваш заказ {заказ} готов. Менеджер {менеджер} на связи. Айданаевна — не имя.");
    expect(r.replaced.map((x) => x.with)).toEqual(["{имя}", "{менеджер}", "{заказ}"]);
  });

  it("нечего заменять — текст как есть, список замен пуст", () => {
    const r = substituteKnown("Печать занимает 5–7 дней.", { name: "Айдана", manager: "Марат", order: 1042 });
    expect(r).toEqual({ text: "Печать занимает 5–7 дней.", replaced: [] });
  });

  it("короткие значения не подставляются (иначе «Ай» съест полслова)", () => {
    expect(substituteKnown("Ай, как здорово", { name: "Ай" }).replaced).toEqual([]);
  });

  it("ответ модели: подстановки только из списка и текст не переписан", () => {
    const original = "Здравствуйте, Айдана! Оплата по ссылке https://x.kz/pay/1";
    expect(parseTemplateDraft({ title: "Как оплатить", text: "Здравствуйте, {имя}! Оплата по ссылке {ссылка}", replaced: [{ was: "Айдана", with: "{имя}" }] }, original, [])).toMatchObject({ title: "Как оплатить", replaced: [{ was: "Айдана", with: "{имя}" }] });
    // выдуманная подстановка — отказ
    expect(parseTemplateDraft({ title: "x", text: "Здравствуйте, {фамилия}!", replaced: [] }, original, [])).toBeNull();
    // модель переписала текст целиком — отказ
    expect(parseTemplateDraft({ title: "x", text: "Привет!", replaced: [] }, original, [])).toBeNull();
    // своё поле сделки разрешено
    expect(parseTemplateDraft({ title: "x", text: "Здравствуйте, Айдана! Оплата по ссылке https://x.kz/pay/1 для {Для кого}", replaced: [] }, original, ["Для кого"])).not.toBeNull();
  });

  it("название по умолчанию — первые слова без подстановок", () => {
    expect(titleFromText("{имя}, оплатить можно *по ссылке* ниже, спасибо")).toBe("оплатить можно по ссылке");
    expect(titleFromText("{имя}, добрый день! Печать и доставка занимают 5–7 дней.")).toBe("Печать и доставка занимают");
    expect(titleFromText("Печатная книга — от 29 000 ₸. Меня зовут {менеджер}")).toBe("Печатная книга");
  });
});
