/** Тексты, которые нужны браузеру без словаря целиком: ошибки сети и запросов (client-api) и дата (dates). */
import type { Messages } from "..";

export const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
export const WEEKDAYS = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];
export const date = (d: Date, withYear = false) => (withYear ? `${d.getFullYear()}-yil ${d.getDate()}-${MONTHS[d.getMonth()]}` : `${d.getDate()}-${MONTHS[d.getMonth()]}`);

export const errors: Messages["common"]["errors"] = {
  generic: "Bajarib bo‘lmadi. Qaytadan urinib ko‘ring.",
  network: "Server bilan aloqa yo‘q. Internetni tekshirib, qaytadan urinib ko‘ring.",
  tooMany: "Juda ko‘p urinish bo‘ldi. Keyinroq qaytadan urinib ko‘ring.",
  notFound: "Topilmadi",
  forbidden: "Ruxsat yo‘q",
  unauthorized: "Profilingizga kiring",
  badRequest: "Kiritilgan ma’lumotlarni tekshiring",
  server: "Bizning tomonda nimadir xato ketdi. Hozir aniqlayapmiz.",
  bookLocked: "Kitob buyurtmada — tahrirlash yopilgan",
  status: (code: number) => `Xato ${code}`,
};
