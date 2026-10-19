import type { access as ru } from "../ru/access";
import { kkCount } from "../../plural";

const hello = (name: string) => `Сәлеметсіз бе${name ? `, ${name}` : ""}!`;

/** Чаттан шот төленгеннен кейін жеке кабинетке кіру: клиентке сол WhatsApp-чатқа шоттың тілінде хабарлама. */
export const access: typeof ru = {
  thisNumber: "осы WhatsApp нөмірі",
  setPassword: (i) =>
    [
      `${hello(i.name)} ${i.label} шоты бойынша төлем қабылданды — ${i.amount}. Рақмет!`,
      "MyBooks жеке кабинетіңіз дайын: кітапты сонда жазасыз.",
      `Құпиясөз орнатып, кіріңіз: ${i.link}`,
      `Логин: ${i.login}`,
      `Сілтеме ${kkCount(i.hours, "сағат")} жарамды және бір рет қана жұмыс істейді.`,
    ].join("\n"),
  loginAsUsual: (i) =>
    [
      `${hello(i.name)} ${i.label} шоты бойынша төлем қабылданды — ${i.amount}. Рақмет!`,
      `Жеке кабинетке әдеттегідей кіріңіз: ${i.loginUrl}`,
      `Логин: ${i.login}`,
      i.emailMasked ? `Құпиясөзді ұмытсаңыз — жаңасын орнату сілтемесін ${i.emailMasked} поштасына жібердік.` : "Құпиясөзді ұмытсаңыз — осында жазыңыз, көмектесеміз.",
    ].join("\n"),
  paid: (i) => `${hello(i.name)} ${i.label} шоты бойынша төлем қабылданды — ${i.amount}. Рақмет! Жеке кабинет: ${i.loginUrl}`,
  manager: (i) => `${hello(i.name)} ${i.label} шоты бойынша төлем қабылданды — ${i.amount}. Рақмет! Менеджер жеке кабинетке кіру деректерін жібереді.`,
};
