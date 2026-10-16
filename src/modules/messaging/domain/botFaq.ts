/**
 * Бот-квалификатор: переменные для ответов на частые вопросы — цены, доставка и сроки берутся из «Цен и тарифов» и
 * config/site, а не пишутся в шаблоне руками. Проверка шаблонов: число, похожее на цену, которого нет в тарифах, —
 * ошибка (иначе бот назовёт цену, которой нет). Без сети и БД.
 */
import type { BotLang } from "./botNlu";

/** Что бот знает о ценах и сроках (адаптер берёт из действующего каталога). */
export interface BotCatalog {
  plans: { id: string; price: number; extraCopyPrice?: number; hidden?: boolean }[];
  delivery: { id: string; price: number }[];
  addons: { id: string; price: number }[];
  productionDays: { standard: string; premium: string };
}

/** Переменные и что в них подставляется — для подсказки в настройках. */
export const BOT_VARS: { key: string; label: string }[] = [
  { key: "{цена.электронная}", label: "электронная книга" },
  { key: "{цена.печатная}", label: "печатная в твёрдой обложке" },
  { key: "{цена.премиум}", label: "премиум (если продаётся)" },
  { key: "{экземпляр.печатная}", label: "доп. экземпляр печатной" },
  { key: "{доставка.курьер}", label: "курьер" },
  { key: "{доставка.почта}", label: "по Казахстану" },
  { key: "{доставка.самовывоз}", label: "самовывоз" },
  { key: "{экспресс}", label: "экспресс-печать" },
  { key: "{упаковка}", label: "подарочная упаковка" },
  { key: "{срок.производства}", label: "печать, рабочих дней" },
  { key: "{срок.экспресс}", label: "экспресс-печать, рабочих дней" },
  { key: "{акция}", label: "строка акции из настроек бота" },
  { key: "{ссылка}", label: "сайт (или пример книги по теме)" },
];

const money = (n: number, lang: BotLang) => (n === 0 ? (lang === "kk" ? "тегін" : "бесплатно") : `${new Intl.NumberFormat("ru-RU").format(n)} ₸`);

/** Значения переменных на языке клиента. Скрытый тариф — пусто: бот не называет то, что не продаётся. */
export function catalogVars(c: BotCatalog, lang: BotLang): Record<string, string> {
  const plan = (id: string) => c.plans.find((p) => p.id === id && !p.hidden);
  const delivery = (id: string) => c.delivery.find((d) => d.id === id);
  const addon = (id: string) => c.addons.find((a) => a.id === id);
  const v = (x: { price: number } | undefined) => (x ? money(x.price, lang) : "");
  const hardcover = plan("hardcover");
  return {
    "цена.электронная": v(plan("digital")),
    "цена.печатная": v(hardcover),
    "цена.премиум": v(plan("premium")),
    "экземпляр.печатная": hardcover?.extraCopyPrice ? money(hardcover.extraCopyPrice, lang) : "",
    "доставка.курьер": v(delivery("courier")),
    "доставка.почта": v(delivery("post")),
    "доставка.самовывоз": v(delivery("pickup")),
    экспресс: v(addon("express")),
    упаковка: v(addon("giftwrap")),
    "срок.производства": c.productionDays.standard,
    "срок.экспресс": c.productionDays.premium,
  };
}

/** Подставить переменные бота ({цена.печатная}, {когда}, {что}…); остальные ({имя}, свои поля) — общим fillTemplate. */
export function fillBotVars(text: string, vars: Record<string, string>) {
  return text.replace(/\{([^{}]{1,40})\}/g, (all, key: string) => (key in vars ? vars[key] : all));
}

/**
 * Числа в шаблоне, похожие на цену или скидку (от 1 000, или с ₸/тг/тенге/%), которых нет в тарифах. Цифры в ответах
 * бота — только переменными: тогда цена в чате не разойдётся с «Ценами и тарифами».
 */
export function pricesOutsideCatalog(text: string, c: BotCatalog): string[] {
  const allowed = new Set([...c.plans.flatMap((p) => [p.price, p.extraCopyPrice ?? -1]), ...c.delivery.map((d) => d.price), ...c.addons.map((a) => a.price)]);
  const out: string[] = [];
  for (const m of text.replace(/\{[^{}]*\}/g, " ").matchAll(/(\d[\d \u00a0\u202f]*\d|\d)([ \u00a0\u202f]*(?:₸|тг|тенге|теңге|%|процент))?/giu)) {
    const n = Number(m[1].replace(/\D/g, ""));
    const priceLike = n >= 1000 || !!m[2];
    if (priceLike && !allowed.has(n)) out.push(m[0].trim());
  }
  return [...new Set(out)];
}
