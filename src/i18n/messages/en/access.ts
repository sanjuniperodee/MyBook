import type { access as ru } from "../ru/access";
import { enCount } from "../../plural";

const hello = (name: string) => `Hello${name ? `, ${name}` : ""}!`;

/** Access to your account after paying an invoice from the chat: messages to the client in the same WhatsApp chat, in the invoice language. */
export const access: typeof ru = {
  thisNumber: "this WhatsApp number",
  setPassword: (i) =>
    [
      `${hello(i.name)} Payment for invoice ${i.label} received — ${i.amount}. Thank you!`,
      "Your MyBooks account is ready: this is where you will write your book.",
      `Set your password and log in: ${i.link}`,
      `Login: ${i.login}`,
      `The link is valid for ${enCount(i.hours, "hour", "hours")} and works only once.`,
    ].join("\n"),
  loginAsUsual: (i) =>
    [
      `${hello(i.name)} Payment for invoice ${i.label} received — ${i.amount}. Thank you!`,
      `Log in to your account as usual: ${i.loginUrl}`,
      `Login: ${i.login}`,
      i.emailMasked ? `If you don’t remember your password, we have sent a link to set a new one to ${i.emailMasked}.` : "If you don’t remember your password, write to us here and we will help.",
    ].join("\n"),
  paid: (i) => `${hello(i.name)} Payment for invoice ${i.label} received — ${i.amount}. Thank you! Your account: ${i.loginUrl}`,
  manager: (i) => `${hello(i.name)} Payment for invoice ${i.label} received — ${i.amount}. Thank you! The manager will send you your account access details.`,
};
