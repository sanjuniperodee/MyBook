import type { pay as ru } from "../ru/pay";

/** An invoice from chat: the /pay/<token> payment page and the message to the customer. */
export const pay: typeof ru = {
  meta: "Pay for your book",
  eyebrow: (label: string) => `Invoice ${label}`,
  title: "A personal book",
  purpose: {
    prepayment: "prepayment",
    remainder: "balance",
    full: "full payment",
    custom: "payment",
  },
  /** The payment purpose: “Personal book: Hardcover, prepayment”. */
  purposeLine: (plan: string, purpose: string, books = 1) => `${books > 1 ? `Personal books (${books})` : "Personal book"}: ${plan}, ${purpose}`,
  /** What is free by agreement — as a line on the invoice page and in the message. */
  gifts: (list: string) => `Free by agreement: ${list}.`,
  summary: (plan: string, purpose: string, agreed: string) => `${plan}, ${purpose}. The agreed price of the book is ${agreed}.`,
  until: (date: string) => `The invoice is valid until ${date}.`,
  toPay: "To pay",
  /** The receipt to the left of the payment methods. */
  receipt: {
    item: "For",
    seller: "Seller",
    bin: (bin: string) => `BIN ${bin}`,
    status: { payable: "Awaiting payment", paid: "Paid", closed: "Closed" },
    secureTitle: "Your payment is protected",
    secureText: "You enter your card in the payment provider’s window — we never see your card details. Kaspi opens in the bank’s app.",
  },
  amountPaid: "Paid",
  amount: "Invoice amount",
  paidTitle: "Payment received",
  paidAccess: "We have sent you access to your account on WhatsApp: that is where you will write your book.",
  paidManager: "Thank you! The manager will contact you and send you access to your account.",
  paidAlready: "Thank you! You already have access to your account — log in as usual.",
  login: "Log in to your account",
  closedTitle: "The invoice is closed",
  cancelled: "This invoice is no longer valid. Message us on WhatsApp and we will send you a current link.",
  expired: "This invoice has expired. Message us on WhatsApp and we will send you a new link.",
  ordered: "An order has already been placed for this book — the payment is made in it, in your account.",
  writeUs: "Message on WhatsApp",
  help: "For questions about payment, message us on WhatsApp.",
  payment: {
    title: "Payment",
    toPay: "To pay:",
    loading: "The payment module is still loading, please try again in a second.",
    description: (n: number) => `Personal book, invoice P${n}`,
    failed: "The payment did not go through",
    failedReason: (r: string) => `The payment did not go through: ${r}`,
    card: "Pay by card",
    sum: "Amount:",
    commentLabel: "comment:",
    commentValue: (n: number) => `P${n}`,
    claimed: "Thank you! The manager will check that the payment has arrived and send you access to your account — usually within an hour during working hours.",
    claim: "I have paid",
  },
  /** A transfer to a phone number: no “order number” step — the payment block adds the amount and the P<n> comment itself. */
  transferSteps: (phone: string, name: string) => ["Open Kaspi.kz → Payments → Transfers → To a phone number", `Recipient’s number: ${phone}${name ? ` (${name})` : ""}`],
  /** Hints of the Kaspi block on the invoice page. */
  kaspi: {
    note: (org: string | null, comment: string) => (org ? `The recipient is ${org}, the payment comment is “${comment}”.` : `The payment comment is “${comment}”.`),
    phoneHint: (masked: string) => `Leave the field empty — the invoice will arrive in the Kaspi account of ${masked}. Or enter a different number.`,
    paid: "Payment received! Refreshing the page…",
  },
  /** The message with an invoice on WhatsApp. */
  message: (i: { name: string; label: string; plan: string; books?: number; purpose: string; amount: string; link: string; until: string; kaspiPhone: string | null; kaspiOrg: string | null; gifts?: string | null }) =>
    [
      `Hello${i.name ? `, ${i.name}` : ""}! Invoice ${i.label} for payment: ${i.books && i.books > 1 ? `personal books, ${i.books} copies (${i.plan})` : `a personal book (${i.plan})`}, ${i.purpose} — ${i.amount}.`,
      i.gifts ? `🎁 Free by agreement: ${i.gifts}.` : null,
      `Pay here: ${i.link}`,
      i.kaspiPhone ? `The invoice has also been sent to the Kaspi app for ${i.kaspiPhone}${i.kaspiOrg ? ` — the recipient is ${i.kaspiOrg}` : ""}.` : null,
      `Valid until ${i.until}.`,
    ]
      .filter(Boolean)
      .join("\n"),
};
