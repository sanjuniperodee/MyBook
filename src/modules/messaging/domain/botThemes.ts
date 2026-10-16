/**
 * «Для кого книга» → тема книги и ссылка. Темы: love | mom | dad | friend и режимы «Автобиография» (autobiography)
 * и «Вручную — своя книга с нуля» (blank, docs/features/book-modes.md). Режимы предлагаются, только когда сайт их уже
 * знает (список тем передаёт адаптер настроек). Ссылки — только на свой сайт.
 */
import { norm, rx, type BotLang } from "./botNlu";

export type BookTheme = "love" | "mom" | "dad" | "friend" | "autobiography" | "blank";
type Localized = Record<BotLang, string>;

interface RecipientDef {
  key: string;
  /** Уверенная форма: «маме», «для мамы», «анама» — годится и для полей, о которых бот не спрашивал. */
  strong: RegExp;
  /** Любая форма («мама») — только в ответ на вопрос «для кого». */
  loose: RegExp;
  label: Localized;
  theme: BookTheme | null;
  /** Посадочная страница-пример /kniga/<slug>. */
  slug: string | null;
}

const def = (key: string, strong: string[], loose: string[], label: Localized, theme: BookTheme | null, slug: string | null): RecipientDef => ({
  key,
  strong: rx(strong),
  loose: rx([...strong, ...loose]),
  label,
  theme,
  slug,
});

/** Порядок важен при совпадении в одной позиции: сначала более точные («историю дедушки» — автобиография). */
const RECIPIENTS: RecipientDef[] = [
  def(
    "self",
    ["\\bо\\s+себе\\b", "\\bдля\\s+себя\\b", "\\bсебе\\b", "\\bсвою\\s+(?:историю|жизнь)", "\\bистори\\S*\\s+(?:моей\\s+)?жизни", "\\bистори\\S*\\s+(?:дедушки|бабушки|деда|папы|мамы|отца|матери|семьи)", "\\bавтобиограф", "\\bмемуар", "\\bвоспоминани\\S*\\s+(?:дедушки|бабушки|папы|мамы)", "\\bөзіме\\b", "\\bөзім\\s+туралы", "\\bөз\\s+өмірім", "\\bөмірбаян", "\\bестелік"],
    ["\\bо\\s+моей\\s+жизни"],
    { ru: "О себе (автобиография)", kk: "Өзіңіз туралы (өмірбаян)" },
    "autobiography",
    null,
  ),
  def(
    "own",
    ["\\bсво(?:ю|я)\\s+книг", "\\bс\\s+нуля\\b", "\\bс\\s+чистого\\s+листа", "\\bсам(?:а|и)?\\s+напиш", "\\bобщую\\b", "\\bо\\s+(?:нашей\\s+)?семье\\b", "\\bсемейн\\S*\\s+(?:книг|истори|летопис)", "\\bродослов", "\\bөз\\s+кітаб", "\\bотбасы\\s+туралы", "\\bотбасымызға", "\\bшежіре"],
    [],
    { ru: "Своя книга с нуля", kk: "Өз кітабыңыз (нөлден)" },
    "blank",
    null,
  ),
  def("husband", ["\\bмужу\\b", "\\bдля\\s+мужа\\b", "\\bсупругу\\b", "\\bкүйеуіме\\b", "\\bкүйеуге\\b", "\\bкуйеуиме\\b", "\\bжолдасыма\\b"], ["\\bмуж(?:а|ем|ик\\S*)?\\b", "\\bсупруг\\b", "\\bкүйеу\\S*", "\\bжолдасым\\b"], { ru: "Мужу", kk: "Күйеуіңізге" }, "love", "podarok-muzhu"),
  def("wife", ["\\bжене\\b", "\\bдля\\s+жены\\b", "\\bсупруге\\b", "\\bәйеліме\\b", "\\bәйелге\\b", "\\bайелиме\\b", "\\bжарыма\\b"], ["\\bжен(?:а|у|ой)\\b", "\\bсупруга\\b", "\\bәйелім\\b", "\\bжарым\\b"], { ru: "Жене", kk: "Әйеліңізге" }, "love", "podarok-zhene"),
  def("girlfriend", ["\\bдевушке\\b", "\\bдля\\s+девушки\\b", "\\bневесте\\b", "\\bсүйген\\s+қызыма", "\\bқалыңдығыма"], ["\\bдевушк\\S*", "\\bневест\\S*"], { ru: "Девушке", kk: "Сүйген қызыңызға" }, "love", "podarok-devushke"),
  def("boyfriend", ["\\bпарню\\b", "\\bдля\\s+парня\\b", "\\bмолодому\\s+человеку", "\\bжениху\\b", "\\bжігітіме\\b", "\\bжигитиме\\b"], ["\\bпар(?:ень|ня)\\b", "\\bжених\\S*", "\\bжігітім\\b"], { ru: "Парню", kk: "Жігітіңізге" }, "love", "podarok-parnyu"),
  def(
    "beloved",
    ["\\bлюбим(?:ому|ой)\\b", "\\bвторой\\s+половин", "\\bсүйіктіме", "\\bсуйиктиме", "\\bсүйікті\\s+адамыма", "\\bжаныма\\b"],
    ["\\bлюбим(?:ый|ая|ого)\\b", "\\bполовинк\\S*", "\\bсүйікті"],
    { ru: "Любимому человеку", kk: "Сүйікті адамыңызға" },
    "love",
    "podarok-lyubimomu",
  ),
  def("grandma", ["\\bбабушке\\b", "\\bбабуле\\b", "\\bдля\\s+бабушки\\b", "\\bәжеме\\b", "\\bажеме\\b", "\\bәжеге\\b"], ["\\bбабушк\\S*", "\\bбабул\\S*", "\\bәжем\\b"], { ru: "Бабушке", kk: "Әжеңізге" }, "mom", null),
  def("grandpa", ["\\bдедушке\\b", "\\bдеду\\b", "\\bдля\\s+дедушки\\b", "\\bатама\\b", "\\bатаға\\b"], ["\\bдедушк\\S*", "\\bдед\\b", "\\bатам\\b"], { ru: "Дедушке", kk: "Атаңызға" }, "dad", null),
  def(
    "mom",
    ["\\bмам(?:е|очке|уле|улечке)\\b", "\\bдля\\s+мам(?:ы|очки)\\b", "\\bматери\\b", "\\bанама\\b", "\\bанашыма\\b", "\\bанаға\\b", "\\bанага\\b", "\\bанамызға\\b", "\\bшешеме\\b", "\\bмамама\\b", "\\b(?:юбиле\\S*|рождени\\S*|годовщин\\S*)\\s+мам(?:ы|очки)\\b"],
    ["\\bмам(?:а|у|ы|ой|очка|уля)\\b", "\\bмать\\b", "\\bанам\\b", "\\bанашым\\b", "\\bшешем\\b"],
    { ru: "Маме", kk: "Анаңызға" },
    "mom",
    "kniga-mame",
  ),
  def(
    "dad",
    ["\\bпап(?:е|очке)\\b", "\\bдля\\s+пап(?:ы|очки)\\b", "\\bотцу\\b", "\\bдля\\s+отца\\b", "\\bәкеме\\b", "\\bәкешіме\\b", "\\bәкеге\\b", "\\bакеме\\b", "\\bпапама\\b", "\\bкөкеме\\b", "\\b(?:юбиле\\S*|рождени\\S*)\\s+(?:папы|отца)\\b"],
    ["\\bпап(?:а|у|ы|ой|очка)\\b", "\\bотец\\b", "\\bотца\\b", "\\bбат(?:я|е)\\b", "\\bәкем\\b"],
    { ru: "Папе", kk: "Әкеңізге" },
    "dad",
    "kniga-pape",
  ),
  def(
    "children",
    ["\\bдочер(?:и|ям)\\b", "\\bдочке\\b", "\\bдоченьке\\b", "\\bсыну\\b", "\\bсыночку\\b", "\\bдетям\\b", "\\bребенку\\b", "\\bвнук(?:у|ам)\\b", "\\bвнучке\\b", "\\bқызыма\\b", "\\bұлыма\\b", "\\bулыма\\b", "\\bбалама\\b", "\\bбалаларыма\\b", "\\bнемереме\\b", "\\bнемерелеріме\\b"],
    ["\\bдоч(?:ь|ка|ки)\\b", "\\bсын(?:а)?\\b", "\\bдет(?:и|ей)\\b", "\\bвнук\\S*"],
    { ru: "Детям", kk: "Балаларыңызға" },
    "blank",
    null,
  ),
  def(
    "friend",
    ["\\bдругу\\b", "\\bдля\\s+друга\\b", "\\bдрузьям\\b", "\\bподруг(?:е|ам)\\b", "\\bдля\\s+подруг(?:и|и)\\b", "\\bподружк(?:е|ам)\\b", "\\bдосыма\\b", "\\bдостарыма\\b", "\\bқұрбыма\\b", "\\bкурбыма\\b", "\\bқұрбыларыма\\b", "\\bқұрбыларға\\b", "\\bдосқа\\b"],
    ["\\bдруг\\b", "\\bдруз(?:ей|ья)\\b", "\\bподруг(?:а|и)\\b", "\\bподружк\\S*", "\\bдосым\\b", "\\bқұрбым\\b"],
    { ru: "Другу или подруге", kk: "Досыңызға не құрбыңызға" },
    "friend",
    "kniga-drugu",
  ),
  def(
    "sibling",
    ["\\bбрату\\b", "\\bсестре\\b", "\\bсестренке\\b", "\\bколлег(?:е|ам)\\b", "\\bучител(?:ю|ьнице)\\b", "\\bәпкеме\\b", "\\bапкеме\\b", "\\bағама\\b", "\\bагама\\b", "\\bініме\\b", "\\bқарындасыма\\b", "\\bсіңліме\\b", "\\bбауырыма\\b"],
    ["\\bбрат\\S*", "\\bсестр\\S*", "\\bколлег\\S*"],
    { ru: "Брату, сестре или коллеге", kk: "Бауырыңызға не әріптесіңізге" },
    "friend",
    null,
  ),
];

/** Подписи тем в меню «для кого» (значение в CRM — русская подпись). */
const MENU: { theme: BookTheme; label: Localized; menu: Localized }[] = [
  { theme: "love", label: { ru: "Любимому человеку", kk: "Сүйікті адамыңызға" }, menu: { ru: "любимому человеку (мужу, жене, девушке, парню)", kk: "сүйікті адамыңызға (күйеуіңізге, әйеліңізге, сүйген қызыңызға не жігітіңізге)" } },
  { theme: "mom", label: { ru: "Маме", kk: "Анаңызға" }, menu: { ru: "маме", kk: "анаңызға" } },
  { theme: "dad", label: { ru: "Папе", kk: "Әкеңізге" }, menu: { ru: "папе", kk: "әкеңізге" } },
  { theme: "friend", label: { ru: "Другу или подруге", kk: "Досыңызға не құрбыңызға" }, menu: { ru: "другу или подруге", kk: "досыңызға не құрбыңызға" } },
  { theme: "autobiography", label: { ru: "О себе (автобиография)", kk: "Өзіңіз туралы (өмірбаян)" }, menu: { ru: "о себе или о близком с его слов (автобиография)", kk: "өзіңіз туралы не жақыныңыздың айтуымен (өмірбаян)" } },
  { theme: "blank", label: { ru: "Своя книга с нуля", kk: "Өз кітабыңыз (нөлден)" }, menu: { ru: "своя книга с нуля — главы придумываете сами", kk: "өз кітабыңыз, нөлден — тарауларды өзіңіз құрасыз" } },
];

export interface Recipient {
  key: string;
  /** Значение для поля сделки (по-русски, как в CRM) и подпись на языке клиента. */
  label: Localized;
  theme: BookTheme | null;
  slug: string | null;
}

/** Пункты меню «для кого» для тем, которые сайт уже знает. */
export const themeMenu = (themes: readonly string[]) => MENU.filter((m) => themes.includes(m.theme));

/** Текст меню с номерами. */
export const themeMenuText = (themes: readonly string[], lang: BotLang) =>
  themeMenu(themes)
    .map((m, i) => `${i + 1} — ${m.menu[lang]}`)
    .join("\n");

/**
 * Получатель в тексте: «маме», «для мужа», «анама», «историю дедушки», «своя книга с нуля», номер пункта меню (menu —
 * когда бот показал меню). strong — только уверенные формы. Тема, которой нет на сайте, не предлагается.
 */
export function findRecipient(text: string, opts: { themes: readonly string[]; menu?: boolean; strong?: boolean }): Recipient | null {
  const t = norm(text);
  if (opts.menu) {
    const n = /^\s*(?:№)?\s*(\d)\s*[.)]?\s*$/.exec(t);
    if (n) {
      const item = themeMenu(opts.themes)[Number(n[1]) - 1];
      return item ? { key: item.theme, label: item.label, theme: item.theme, slug: null } : null;
    }
  }
  let best: { r: RecipientDef; at: number } | null = null;
  for (const r of RECIPIENTS) {
    const m = (opts.strong ? r.strong : r.loose).exec(t);
    if (m && (!best || m.index < best.at)) best = { r, at: m.index };
  }
  if (!best) return null;
  const { r } = best;
  const theme = r.theme && opts.themes.includes(r.theme) ? r.theme : null;
  return { key: r.key, label: r.label, theme, slug: r.slug };
}

/** Подпись темы на языке клиента — для сводки и подтверждения. */
export const themeLabel = (theme: string, lang: BotLang) => MENU.find((m) => m.theme === theme)?.label[lang] ?? theme;

/**
 * Ссылка для клиента: регистрация открыта — сразу начать книгу этой темы; закрыта — посадочная страница-пример (если она
 * есть); клиент уже с аккаунтом — новая книга в кабинете. Только адрес своего сайта.
 */
export function bookLink(r: Recipient, site: { url: string; registrationOpen: boolean; landings: readonly string[] }, lang: BotLang, knownClient: boolean): { url: string; kind: "start" | "example" } | null {
  const base = site.url.replace(/\/+$/, "");
  if (!/^https?:\/\//.test(base)) return null;
  const prefix = lang === "kk" ? "/kk" : "";
  if (r.theme && knownClient) return { url: `${base}${prefix}/books/new?theme=${r.theme}`, kind: "start" };
  if (r.theme && site.registrationOpen) return { url: `${base}${prefix}/register?theme=${r.theme}`, kind: "start" };
  if (r.slug && site.landings.includes(r.slug)) return { url: `${base}${prefix}/kniga/${r.slug}`, kind: "example" };
  return null;
}
