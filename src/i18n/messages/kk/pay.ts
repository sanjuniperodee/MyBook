import type { pay as ru } from "../ru/pay";

/** Чаттан шот: /pay/<token> төлем беті және клиентке хабарлама. */
export const pay: typeof ru = {
  meta: "Кітапты төлеу",
  eyebrow: (label: string) => `${label} шоты`,
  title: "Жеке кітап",
  purpose: {
    prepayment: "алдын ала төлем",
    remainder: "қалған сома",
    full: "толық төлем",
    custom: "төлем",
  },
  summary: (plan: string, purpose: string, agreed: string) => `${plan}, ${purpose}. Келісілген кітап бағасы — ${agreed}.`,
  until: (date: string) => `Шот ${date} дейін жарамды.`,
  paidTitle: "Төлем қабылданды",
  paidAccess: "Жеке кабинетке кіру деректерін WhatsApp-қа жібердік: кітапты сонда жазасыз.",
  paidManager: "Рақмет! Менеджер сізбен хабарласып, кабинетке кіру деректерін жібереді.",
  login: "Кабинетке кіру",
  closedTitle: "Шот жабылды",
  cancelled: "Бұл шот енді жарамсыз. Бізге WhatsApp-қа жазыңыз — жаңа сілтеме жібереміз.",
  expired: "Бұл шоттың мерзімі өтті. Бізге WhatsApp-қа жазыңыз — жаңа сілтеме жібереміз.",
  ordered: "Бұл кітапқа тапсырыс рәсімделген — төлем жеке кабинеттегі тапсырыста.",
  writeUs: "WhatsApp-қа жазу",
  payment: {
    title: "Төлем",
    toPay: "Төленетін сома:",
    loading: "Төлем модулі әлі жүктелуде, бір секундтан соң қайталаңыз.",
    description: (n: number) => `Жеке кітап, P${n} шоты`,
    failed: "Төлем өтпеді",
    failedReason: (r: string) => `Төлем өтпеді: ${r}`,
    card: "Картамен төлеу",
    sum: "Сома:",
    commentLabel: "түсініктеме:",
    commentValue: (n: number) => `P${n}`,
    claimed: "Рақмет! Менеджер төлемді тексеріп, кабинетке кіру деректерін жібереді — әдетте жұмыс уақытында бір сағат ішінде.",
    claim: "Мен төледім",
  },
  message: (i) =>
    [
      `Сәлеметсіз бе${i.name ? `, ${i.name}` : ""}! ${i.label} төлем шоты: жеке кітап (${i.plan}), ${i.purpose} — ${i.amount}.`,
      `Төлеу: ${i.link}`,
      i.kaspiPhone ? `Шот Kaspi қосымшасына да ${i.kaspiPhone} нөміріне келді${i.kaspiOrg ? ` — алушы ${i.kaspiOrg}` : ""}.` : null,
      `${i.until} дейін жарамды.`,
    ]
      .filter(Boolean)
      .join("\n"),
};
