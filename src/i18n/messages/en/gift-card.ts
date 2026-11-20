import type { card as ru } from "../ru/gift-card";

/** The certificate itself: HTML preview and PDF. The language is the one chosen by the buyer (gift_cards.locale). */
export const card: typeof ru = {
  brandLine: (brand: string) => `${brand} · gift certificate`,
  title: "A book about what matters most",
  recipient: "Recipient",
  book: "Book",
  amount: (price: string) => `worth ${price}`,
  code: "CODE",
  howTo: (host: string) => `How to use it: open ${host}/en/redeem, enter the code and write your book — answer the questions, add photos and choose a cover. The certificate is applied when you place your order.`,
  footer: (n: number, until: string) => `№ ${n} · valid ${until}`,
  docTitle: (brand: string) => `${brand} gift certificate`,
  filename: (n: number) => `mybooks-certificate-${n}.pdf`,
};
