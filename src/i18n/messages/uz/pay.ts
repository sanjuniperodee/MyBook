import type { pay as ru } from "../ru/pay";

/** Chatdan hisob: /pay/<token> to‘lov sahifasi va mijozga xabar. */
export const pay: typeof ru = {
  meta: "Kitob uchun to‘lov",
  eyebrow: (label: string) => `Hisob ${label}`,
  title: "Shaxsiy kitob",
  purpose: {
    prepayment: "oldindan to‘lov",
    remainder: "qolgan summa",
    full: "to‘liq to‘lov",
    custom: "to‘lov",
  } as Record<"prepayment" | "remainder" | "full" | "custom", string>,
  /** To‘lov maqsadi: «Shaxsiy kitob: Qattiq muqova, oldindan to‘lov». */
  purposeLine: (plan: string, purpose: string, books = 1) => `${books > 1 ? `Shaxsiy kitoblar (${books} dona)` : "Shaxsiy kitob"}: ${plan}, ${purpose}`,
  /** Kelishuv bo‘yicha nima bepul — hisob sahifasida va xabarda bir qator. */
  gifts: (list: string) => `Kelishuv bo‘yicha bepul: ${list}.`,
  summary: (plan: string, purpose: string, agreed: string) => `${plan}, ${purpose}. Kitobning kelishilgan narxi — ${agreed}.`,
  until: (date: string) => `Hisobning amal qilish muddati: ${date}.`,
  toPay: "To‘lanadigan summa",
  /** To‘lov usullari yonidagi kvitansiya. */
  receipt: {
    item: "Nima uchun",
    seller: "Sotuvchi",
    bin: (bin: string) => `BIN ${bin}`,
    status: { payable: "To‘lovni kutmoqda", paid: "To‘langan", closed: "Yopilgan" },
    secureTitle: "To‘lov himoyalangan",
    secureText: "Kartani to‘lov tizimi oynasida kiritasiz — karta ma’lumotlarini biz ko‘rmaymiz. Kaspi bank ilovasida ochiladi.",
  },
  amountPaid: "To‘langan",
  amount: "Hisob summasi",
  paidTitle: "To‘lov qabul qilindi",
  paidAccess: "Shaxsiy kabinetga kirish havolasini sizga WhatsApp orqali yubordik: kitobni o‘sha yerda yozasiz.",
  paidManager: "Rahmat! Menejer siz bilan bog‘lanadi va kabinetga kirish havolasini yuboradi.",
  paidAlready: "Rahmat! Shaxsiy kabinetga kirish sizda allaqachon bor — odatdagidek kiring.",
  login: "Kabinetga kirish",
  closedTitle: "Hisob yopilgan",
  cancelled: "Bu hisob endi amal qilmaydi. Bizga WhatsApp orqali yozing — joriy havolani yuboramiz.",
  expired: "Bu hisobning muddati tugagan. Bizga WhatsApp orqali yozing — yangi havolani yuboramiz.",
  ordered: "Bu kitob bo‘yicha buyurtma allaqachon rasmiylashtirilgan — to‘lov shaxsiy kabinetda, buyurtmaning o‘zida amalga oshiriladi.",
  writeUs: "WhatsApp orqali yozish",
  help: "To‘lov bo‘yicha savollar — bizga WhatsApp orqali yozing.",
  payment: {
    title: "To‘lov",
    toPay: "To‘lanadigan summa:",
    loading: "To‘lov moduli hali yuklanmoqda, bir soniyadan keyin urinib ko‘ring.",
    description: (n: number) => `Shaxsiy kitob, hisob P${n}`,
    failed: "To‘lov o‘tmadi",
    failedReason: (r: string) => `To‘lov o‘tmadi: ${r}`,
    card: "Karta bilan to‘lash",
    sum: "Summa:",
    commentLabel: "izoh:",
    commentValue: (n: number) => `P${n}`,
    claimed: "Rahmat! Menejer to‘lov kelganini tekshirib, kabinetga kirish havolasini yuboradi — odatda ish vaqtida bir soat ichida.",
    claim: "Men to‘ladim",
  },
  /** Raqam bo‘yicha o‘tkazma: «buyurtma raqami» qadamisiz — summa va P<n> izohini to‘lov bloki o‘zi qo‘shadi. */
  transferSteps: (phone: string, name: string) => ["Kaspi.kz ilovasini oching → To‘lovlar → O‘tkazmalar → Telefon raqami bo‘yicha", `Oluvchining raqami: ${phone}${name ? ` (${name})` : ""}`],
  /** Hisob sahifasidagi Kaspi blokining maslahatlari. */
  kaspi: {
    note: (org: string | null, comment: string) => (org ? `Oluvchi — ${org}, to‘lov izohi — «${comment}».` : `To‘lov izohi — «${comment}».`),
    phoneHint: (masked: string) => `Maydonni bo‘sh qoldiring — hisob Kaspi ilovasiga ${masked} raqamiga keladi. Yoki boshqa raqamni ko‘rsating.`,
    paid: "To‘lov qabul qilindi! Sahifa yangilanmoqda…",
  },
  /** WhatsApp’dagi hisob xabari. */
  message: (i: { name: string; label: string; plan: string; books?: number; purpose: string; amount: string; link: string; until: string; kaspiPhone: string | null; kaspiOrg: string | null; gifts?: string | null }) =>
    [
      `Assalomu alaykum${i.name ? `, ${i.name}` : ""}! To‘lov uchun hisob ${i.label}: ${i.books && i.books > 1 ? `shaxsiy kitoblar, ${i.books} dona (${i.plan})` : `shaxsiy kitob (${i.plan})`}, ${i.purpose} — ${i.amount}.`,
      i.gifts ? `🎁 Kelishuv bo‘yicha bepul: ${i.gifts}.` : null,
      `To‘lash: ${i.link}`,
      i.kaspiPhone ? `Hisob shuningdek Kaspi ilovasiga ${i.kaspiPhone} raqamiga ham keldi${i.kaspiOrg ? ` — oluvchi ${i.kaspiOrg}` : ""}.` : null,
      `Amal qilish muddati: ${i.until}.`,
    ]
      .filter(Boolean)
      .join("\n"),
};
