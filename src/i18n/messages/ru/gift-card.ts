/** Сам сертификат: HTML-превью и PDF. Язык — выбранный покупателем (gift_cards.locale). */
export const card = {
  brandLine: (brand: string) => `${brand} · подарочный сертификат`,
  title: "Книга о самом важном",
  recipient: "Получатель",
  book: "Книга",
  amount: (price: string) => `на сумму ${price}`,
  code: "КОД",
  howTo: (host: string) => `Как воспользоваться: откройте ${host}/redeem, введите код и напишите книгу — ответьте на вопросы, добавьте фотографии и выберите обложку. Сертификат применяется при оформлении заказа.`,
  footer: (n: number, until: string) => `№ ${n} · действует ${until}`,
  docTitle: (brand: string) => `Подарочный сертификат ${brand}`,
  filename: (n: number) => `mybooks-sertifikat-${n}.pdf`,
};
