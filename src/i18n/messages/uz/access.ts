import type { access as ru } from "../ru/access";
import { uzCount } from "../../plural";

const hello = (name: string) => `Assalomu alaykum${name ? `, ${name}` : ""}!`;

/** Доступ в личный кабинет после оплаты счёта из чата: сообщения клиенту в тот же WhatsApp-чат на языке счёта. */
export const access: typeof ru = {
  thisNumber: "shu WhatsApp raqami",
  setPassword: (i) =>
    [
      `${hello(i.name)} ${i.label} hisobi bo‘yicha to‘lov qabul qilindi — ${i.amount}. Rahmat!`,
      "MyBooks shaxsiy kabinetingiz tayyor: kitobni shu yerda yozasiz.",
      `Parol o‘rnating va kiring: ${i.link}`,
      `Login: ${i.login}`,
      `Havola ${uzCount(i.hours, "soat")} amal qiladi va faqat bir marta ishlaydi.`,
    ].join("\n"),
  loginAsUsual: (i) =>
    [
      `${hello(i.name)} ${i.label} hisobi bo‘yicha to‘lov qabul qilindi — ${i.amount}. Rahmat!`,
      `Shaxsiy kabinetga odatdagidek kiring: ${i.loginUrl}`,
      `Login: ${i.login}`,
      i.emailMasked ? `Parolni unutgan bo‘lsangiz — yangisini o‘rnatish havolasini ${i.emailMasked} manziliga yubordik.` : "Parolni unutgan bo‘lsangiz — shu yerga yozing, yordam beramiz.",
    ].join("\n"),
  paid: (i) => `${hello(i.name)} ${i.label} hisobi bo‘yicha to‘lov qabul qilindi — ${i.amount}. Rahmat! Shaxsiy kabinet: ${i.loginUrl}`,
  manager: (i) => `${hello(i.name)} ${i.label} hisobi bo‘yicha to‘lov qabul qilindi — ${i.amount}. Rahmat! Menejer sizga shaxsiy kabinetga kirish ma’lumotlarini yuboradi.`,
};
