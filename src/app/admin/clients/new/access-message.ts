import { formatPhone } from "@/shared/domain/phone";

export interface AccessMessageInput {
  name: string;
  /** Номер телефона (цифры) или e-mail — то, что вводят в поле входа. */
  login: string;
  password: string;
  loginUrl: string;
  locale: "ru" | "kk";
}

/** Логин для показа: телефон — в читаемом виде, почта — как есть. */
export function displayLogin(login: string) {
  return login.includes("@") ? login : formatPhone(login) || login;
}

/** Готовый текст для WhatsApp/СМС: менеджер копирует его клиенту целиком. */
export function accessMessage({ name, login, password, loginUrl, locale }: AccessMessageInput): string {
  const who = name.trim();
  if (locale === "kk")
    return [`Сәлеметсіз бе${who ? `, ${who}` : ""}! MyBooks жеке кабинетіне кіру деректері:`, `Сайт: ${loginUrl}`, `Логин: ${displayLogin(login)}`, `Құпиясөз: ${password}`, "Кабинетте кітабыңыз бен тапсырысыңызды көресіз. Құпиясөзді профильден өзгертуге болады."].join("\n");
  return [`Здравствуйте${who ? `, ${who}` : ""}! Ваш доступ в личный кабинет MyBooks:`, `Сайт: ${loginUrl}`, `Логин: ${displayLogin(login)}`, `Пароль: ${password}`, "В кабинете вы увидите свою книгу и заказ. Пароль можно сменить в профиле."].join("\n");
}
