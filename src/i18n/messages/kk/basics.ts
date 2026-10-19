/** Тексты, которые нужны браузеру без словаря целиком: ошибки сети и запросов (client-api) и дата (dates). */
import type { Messages } from "..";

export const MONTHS = ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"];
export const date = (d: Date, withYear = false) => (withYear ? `${d.getFullYear()} жылғы ${d.getDate()} ${MONTHS[d.getMonth()]}` : `${d.getDate()} ${MONTHS[d.getMonth()]}`);

export const errors: Messages["common"]["errors"] = {
  generic: "Болмады. Қайталап көріңіз.",
  network: "Сервермен байланыс жоқ. Интернетті тексеріп, қайталап көріңіз.",
  tooMany: "Тым көп әрекет жасалды. Кейінірек қайталаңыз.",
  notFound: "Табылмады",
  forbidden: "Кіруге рұқсат жоқ",
  unauthorized: "Аккаунтқа кіріңіз",
  badRequest: "Енгізілген деректерді тексеріңіз",
  server: "Біздің жақта ақау болды. Қазір анықтап жатырмыз.",
  bookLocked: "Кітапқа тапсырыс берілген — өңдеу жабық",
  status: (code: number) => `${code} қатесі`,
};
