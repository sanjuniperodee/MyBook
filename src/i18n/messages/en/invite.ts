import type { invite as ru } from "../ru/invite";
import { enCount } from "../../plural";

/** Invitations: “a discount on the first book for a friend, a promo code for you for each friend”. */
export const invite: typeof ru = {
  meta: "Invite a friend",
  eyebrow: "Invitations",
  title: "Give your friends a discount on their book",
  lead: (friend: number, reward: number) => `Your friend gets ${friend}% off their first book, and you get a ${reward}% promo code for every friend who orders one. You can invite as many friends as you like.`,
  yourLink: "Your link",
  yourCode: (code: string) => `Or just tell them the code ${code} — it is entered at checkout.`,
  copy: "Copy the link",
  copied: "Link copied",
  share: "Share",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  message: (link: string, percent: number) =>
    `Try MyBooks: you answer warm, thoughtful questions — and get a real book as a gift for someone close to you. With my link you get ${percent}% off your first book: ${link}`,
  stepsTitle: "How it works",
  steps: (friend: number, reward: number) => [
    "Send the link to a friend — on WhatsApp, Telegram or any way you like.",
    `Your friend writes their own book, and the ${friend}% discount is applied automatically at checkout.`,
    `When your friend pays for the order, a ${reward}% promo code will arrive in your e-mail — for your next book or as a gift for someone else.`,
  ],
  statsTitle: "Your invitations",
  friends: (n: number) => (n ? `${enCount(n, "friend has", "friends have")} ordered a book with your link` : "Nobody has ordered a book with your link yet — now is a good time to share it."),
  rewards: "Your promo codes",
  rewardFor: (n: number) => `For a friend’s order №${n}`,
  rewardForChat: (n: number) => `For a friend’s purchase in chat (request №${n})`,
  until: (date: string) => `valid until ${date}`,
  used: "used",
  expired: "expired",
  rules: "A friend’s discount applies to their first book and cannot be combined with other promo codes. You cannot use your own code.",
  /** The card on the order page. */
  card: {
    title: "Give your friends a discount",
    text: (friend: number, reward: number) => `${friend}% off a first book for your friends, ${reward}% off for you for everyone who orders.`,
    button: "Invite a friend",
  },
  /** The greeting on the site for an invitation link. */
  welcome: (from: string, percent: number) => (from ? `${from} is giving you ${percent}% off your first book` : `A gift for you — ${percent}% off your first book`),
  welcomeNote: "The discount will be applied automatically at checkout.",
};
