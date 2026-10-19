import { formatPhone } from "@/shared/domain/phone";
import { maskEmail, maskPhone } from "@/modules/access/domain";

interface AccessMessageInput {
  name: string;
  /** Номер телефона (цифры) или e-mail — то, что вводят в поле входа. */
  login: string;
  password: string;
  loginUrl: string;
  locale: "ru" | "kk";
  /** Менеджеру без права видеть контакты: в тексте номер/почта не пишутся — клиент входит «по своему номеру». */
  hideLogin?: boolean;
}

/** Логин для показа: телефон — в читаемом виде, почта — как есть. */
export function displayLogin(login: string) {
  return login.includes("@") ? login : formatPhone(login) || login;
}

/** Логин для сотрудника: без права clients.contacts — с маской (полный номер и почту видеть нельзя ни на экране, ни в данных страницы). */
export function staffLogin(login: string, full: boolean) {
  if (full) return displayLogin(login);
  return login.includes("@") ? maskEmail(login) : maskPhone(login);
}

/** Логин в тексте клиенту при скрытых контактах: клиент знает свой номер, почту узнает по маске. */
function hiddenLogin(login: string, locale: "ru" | "kk") {
  if (login.includes("@")) return maskEmail(login);
  return locale === "kk" ? "тапсырыс кезінде көрсеткен телефон нөміріңіз" : "номер телефона, который вы указали при заказе";
}

/** Готовый текст для WhatsApp/СМС: менеджер копирует его клиенту целиком. */
export function accessMessage({ name, login, password, loginUrl, locale, hideLogin }: AccessMessageInput): string {
  const who = name.trim();
  const shown = hideLogin ? hiddenLogin(login, locale) : displayLogin(login);
  if (locale === "kk")
    return [`Сәлеметсіз бе${who ? `, ${who}` : ""}! MyBooks жеке кабинетіне кіру деректері:`, `Сайт: ${loginUrl}`, `Логин: ${shown}`, `Құпиясөз: ${password}`, "Кабинетте кітабыңыз бен тапсырысыңызды көресіз. Құпиясөзді профильден өзгертуге болады."].join("\n");
  return [`Здравствуйте${who ? `, ${who}` : ""}! Ваш доступ в личный кабинет MyBooks:`, `Сайт: ${loginUrl}`, `Логин: ${shown}`, `Пароль: ${password}`, "В кабинете вы увидите свою книгу и заказ. Пароль можно сменить в профиле."].join("\n");
}
