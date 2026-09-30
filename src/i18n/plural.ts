/** Русские формы после числа: 1 ответ, 2 ответа, 5 ответов. В казахском форма после числа одна. */
export function ruPlural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

export const ruCount = (n: number, one: string, few: string, many: string) => `${n.toLocaleString("ru-RU")} ${ruPlural(n, one, few, many)}`;
/** Разделители разрядов в казахском те же, что в русском; Intl("kk-KZ") не используем — его нет в части браузеров. */
export const kkCount = (n: number, word: string) => `${n.toLocaleString("ru-RU")} ${word}`;
