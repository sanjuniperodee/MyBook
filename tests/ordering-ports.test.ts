import { describe, expect, it } from "vitest";
import type { GiftPdfData, GiftPdfRenderer } from "@/modules/ordering/application";
import { OrderingMailer } from "@/modules/ordering/infrastructure/notifications/OrderingMailer";
import type { GiftView } from "@/modules/ordering/infrastructure/persistence/DrizzleOrderingQueries";

// Порты ordering → production: сертификат рисует чужой модуль, ordering знает только контракт GiftPdfRenderer.
const gift = {
  locale: "kk",
  number: 7,
  plan: "hardcover",
  amount: 25_000,
  buyerName: "Айгерим",
  recipientName: "Мама",
  message: "С днём рождения!",
  promo: { code: "GIFT-1", expiresAt: new Date("2027-01-01T00:00:00Z") },
} as unknown as GiftView;

function mailer(render: GiftPdfRenderer["render"]) {
  // Запросы и сертификаты письму здесь не нужны: проверяем только путь к рендереру.
  return new OrderingMailer({} as never, {} as never, { configured: async () => true, send: async () => {} }, { render });
}

describe("OrderingMailer: PDF сертификата через порт GiftPdfRenderer", () => {
  it("рендерер получает данные сертификата, срок действия — из промокода", async () => {
    const calls: GiftPdfData[] = [];
    const pdf = await mailer(async (d) => (calls.push(d), Buffer.from("pdf"))).giftPdf(gift);
    expect(pdf).toEqual(Buffer.from("pdf"));
    expect(calls).toEqual([{ locale: "kk", number: 7, code: "GIFT-1", plan: "hardcover", amount: 25_000, buyerName: "Айгерим", recipientName: "Мама", message: "С днём рождения!", validUntil: new Date("2027-01-01T00:00:00Z") }]);
  });

  it("неоплаченный сертификат (нет промокода) не рисуется", async () => {
    const calls: GiftPdfData[] = [];
    await expect(mailer(async (d) => (calls.push(d), Buffer.alloc(0))).giftPdf({ ...gift, promo: null } as GiftView)).rejects.toThrow("gift is not paid yet");
    expect(calls).toEqual([]);
  });
});
