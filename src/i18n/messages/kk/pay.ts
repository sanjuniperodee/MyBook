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
  purposeLine: (plan, purpose) => `Жеке кітап: ${plan}, ${purpose}`,
  summary: (plan: string, purpose: string, agreed: string) => `${plan}, ${purpose}. Келісілген кітап бағасы — ${agreed}.`,
  // Дата приходит в именительном падеже («23 қазан»): с «дейін» нужен дательный, поэтому «мерзімі — …».
  until: (date: string) => `Төлеу мерзімі — ${date}.`,
  toPay: "Төленетін сома",
  amountPaid: "Төленді",
  amount: "Шот сомасы",
  paidTitle: "Төлем қабылданды",
  paidAccess: "Жеке кабинетке кіру деректерін WhatsApp-қа жібердік: кітапты сонда жазасыз.",
  paidManager: "Рақмет! Менеджер сізбен хабарласып, кабинетке кіру деректерін жібереді.",
  login: "Кабинетке кіру",
  closedTitle: "Шот жабылды",
  cancelled: "Бұл шот енді жарамсыз. Бізге WhatsApp-қа жазыңыз — жаңа сілтеме жібереміз.",
  expired: "Бұл шоттың мерзімі өтті. Бізге WhatsApp-қа жазыңыз — жаңа сілтеме жібереміз.",
  ordered: "Бұл кітапқа тапсырыс рәсімделген — төлем жеке кабинеттегі тапсырыста.",
  writeUs: "WhatsApp-қа жазу",
  help: "Төлем бойынша сұрақтарыңызды WhatsApp-қа жазыңыз.",
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
  transferSteps: (phone, name) => ["Kaspi.kz → Төлемдер → Аударымдар → Телефон нөмірі бойынша бөлімін ашыңыз", `Алушының нөмірі: ${phone}${name ? ` (${name})` : ""}`],
  kaspi: {
    note: (org, comment) => (org ? `Алушы — ${org}, төлемге түсініктеме — «${comment}».` : `Төлемге түсініктеме — «${comment}».`),
    phoneHint: (masked) => `Өрісті бос қалдырыңыз — шот Kaspi-ге ${masked} нөміріне келеді. Немесе басқа нөмір көрсетіңіз.`,
    paid: "Төлем қабылданды! Бет жаңартылып жатыр…",
  },
  message: (i) =>
    [
      `Сәлеметсіз бе${i.name ? `, ${i.name}` : ""}! ${i.label} төлем шоты: жеке кітап (${i.plan}), ${i.purpose} — ${i.amount}.`,
      `Төлеу: ${i.link}`,
      i.kaspiPhone ? `Шот Kaspi қосымшасына да ${i.kaspiPhone} нөміріне келді${i.kaspiOrg ? ` — алушы ${i.kaspiOrg}` : ""}.` : null,
      `Төлеу мерзімі — ${i.until}.`,
    ]
      .filter(Boolean)
      .join("\n"),
};
