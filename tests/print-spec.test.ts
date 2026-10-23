import { describe, expect, it } from "vitest";
import { printSpecText } from "@/modules/production/infrastructure/pdf/render";

// Техзадание для типографии: тираж и тариф (deals-d11).
const book = {
  id: "b1",
  theme: "mom",
  language: "ru" as const,
  title: "Маме",
  subtitle: "",
  authorName: "Айжан",
  authorGender: "f" as const,
  recordedBy: "",
  recipientName: "Маме",
  recipientGender: "f" as const,
  dedication: "",
  interior: "classic",
  format: "a5",
  photoPlacement: "chapters" as const,
  showToc: true,
  coverPhotoId: null,
  hideRecipientOnCover: false,
  coverTemplate: "linen",
};
const bundle = { book } as never;
const pkg = { pageCount: 64, spineMm: 8.4 } as never;

describe("техзадание для типографии", () => {
  it("тираж и тариф «Премиум» — свой переплёт и материалы", () => {
    const text = printSpecText(bundle, pkg, { number: 12, plan: "premium", quantity: 3 });
    expect(text).toContain("ЗАКАЗ №12");
    expect(text).toContain("Тариф: Премиум");
    expect(text).toContain("Тираж: 3 экз. — одинаковые");
    expect(text).toContain("Переплёт: твёрдый, 7БЦ, шитьё нитками; дизайнерская бумага, подарочная коробка");
  });

  it("твёрдая обложка, один экземпляр; без данных заказа — тираж 1 и обычный переплёт", () => {
    expect(printSpecText(bundle, pkg, { number: 7, plan: "hardcover", quantity: 1 })).toContain("Тариф: Твёрдая обложка");
    const bare = printSpecText(bundle, pkg);
    expect(bare).toContain("Тираж: 1 экз.");
    expect(bare).not.toContain("Тариф:");
    expect(bare).toContain("Переплёт: твёрдый, 7БЦ, шитьё нитками");
  });
});
