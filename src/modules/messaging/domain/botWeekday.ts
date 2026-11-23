/**
 * День недели рядом с числом в ответе модели: «напишу вам в понедельник, 1 декабря», когда 1 декабря — вторник (живая
 * проверка 24.11: DeepSeek считает дни недели наугад). Код знает календарь — неверный день недели заменяет верным, не
 * переспрашивая модель. Русский, казахский, узбекский (латиница и кириллица) и английский. Без сети и БД.
 */

const RU_NOM = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];
const RU_ACC = ["понедельник", "вторник", "среду", "четверг", "пятницу", "субботу", "воскресенье"];
const RU_MONTHS = ["январ", "феврал", "март", "апрел", "ма[йя]", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр"];
const KK_DAYS = ["дүйсенбі", "сейсенбі", "сәрсенбі", "бейсенбі", "жұма", "сенбі", "жексенбі"];
const KK_MONTHS = ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"];
const UZ_DAYS = ["dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba", "yakshanba"];
const UZ_CYR_DAYS = ["душанба", "сешанба", "чоршанба", "пайшанба", "жума", "шанба", "якшанба"];
const UZ_MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const UZ_CYR_MONTHS = ["январ", "феврал", "март", "апрел", "май", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр"];
const EN_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const EN_MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

interface Lang {
  /** Формы дней недели (индекс 0 — понедельник) и как подставить верный день вместо найденного слова. */
  days: string[][];
  replace: (found: string, right: number) => string;
  months: string[];
}

const keepCase = (found: string, word: string) => (found[0] === found[0].toUpperCase() ? word[0].toUpperCase() + word.slice(1) : word);

const LANGS: Lang[] = [
  {
    days: [RU_NOM, RU_ACC],
    // Падеж — как у найденного слова: «в среду» → «в пятницу», «среда» → «пятница».
    replace: (found, right) => keepCase(found, RU_NOM.includes(found.toLowerCase()) ? RU_NOM[right] : RU_ACC[right]),
    months: RU_MONTHS,
  },
  { days: [KK_DAYS], replace: (found, right) => keepCase(found, KK_DAYS[right]), months: KK_MONTHS },
  { days: [UZ_DAYS], replace: (found, right) => keepCase(found, UZ_DAYS[right]), months: UZ_MONTHS },
  { days: [UZ_CYR_DAYS], replace: (found, right) => keepCase(found, UZ_CYR_DAYS[right]), months: UZ_CYR_MONTHS },
  { days: [EN_DAYS], replace: (found, right) => keepCase(found, EN_DAYS[right][0].toUpperCase() + EN_DAYS[right].slice(1)), months: EN_MONTHS },
];

const L = "\\p{L}";
const notLetter = (s: string) => `(?<![${L}])(?:${s})(?![${L}])`;

/** Число и месяц → ГГГГ-ММ-ДД ближайшей такой даты не раньше сегодняшней. */
function resolve(day: number, month: number, today: string): string | null {
  const year = Number(today.slice(0, 4));
  for (const y of [year, year + 1]) {
    const d = new Date(Date.UTC(y, month, day));
    if (d.getUTCMonth() !== month) return null;
    const iso = d.toISOString().slice(0, 10);
    if (iso >= today) return iso;
  }
  return null;
}

/** Понедельник = 0. */
const weekdayIndex = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;

/**
 * Неверные дни недели рядом с датой («во вторник, 1 декабря», «1 желтоқсан, дүйсенбі», «Monday, December 1») — верными.
 * today — сегодня по поясу магазина (ГГГГ-ММ-ДД). fixed — что поменяли, для следа хода.
 */
export function fixWeekdays(reply: string, today: string): { text: string; fixed: string[] } {
  let text = reply;
  const fixed: string[] = [];
  for (const lang of LANGS) {
    const forms = [...new Set(lang.days.flat())];
    const dayRe = forms.map((f) => f.replace(/\s/g, "\\s")).join("|");
    const monthRe = lang.months.join("|");
    // День недели, затем в пределах нескольких слов — «1 декабря» / «1-dekabr» / «December 1»; или наоборот.
    const date = `(\\d{1,2})(?:-?(?:го|ші|шы|чи))?[\\s-]*(${monthRe})[${L}]*|(${monthRe})[${L}]*\\s+(\\d{1,2})(?![\\d])`;
    const re = new RegExp(`${notLetter(`(${dayRe})`)}([^\\n.!?]{0,12}?)(?:${date})|(?:${date})([^\\n.!?]{0,12}?)${notLetter(`(${dayRe})`)}`, "giu");
    text = text.replace(re, (all: string, ...g: (string | undefined)[]) => {
      // Группы: 1 день, 2 между, 3–6 дата (число-месяц | месяц-число); 7–10 дата, 11 между, 12 день.
      const [d1, , n1, m1, m2, n2, n3, m3, m4, n4, , d2] = g;
      const found = (d1 ?? d2)!;
      const num = Number(n1 ?? n2 ?? n3 ?? n4);
      const monthWord = (m1 ?? m2 ?? m3 ?? m4)!.toLowerCase();
      const month = lang.months.findIndex((m) => new RegExp(`^(?:${m})`, "iu").test(monthWord));
      const iso = month >= 0 ? resolve(num, month, today) : null;
      if (!iso) return all;
      const right = weekdayIndex(iso);
      const said = lang.days.map((list) => list.findIndex((f) => f === found.toLowerCase())).find((i) => i >= 0) ?? -1;
      if (said < 0 || said === right) return all;
      const word = lang.replace(found, right);
      fixed.push(`${found} → ${word} (${iso})`);
      // «в вторник» → «во вторник» и обратно — предлог перед днём недели.
      return all.replace(found, word);
    });
  }
  text = text.replace(/(?<![\p{L}])([Вв])о?(\s+)(вторник)/gu, "$1о$2$3").replace(/(?<![\p{L}])([Вв])о(\s+)(понедельник|среду|четверг|пятницу|субботу|воскресенье)/gu, "$1$2$3");
  return { text, fixed };
}
