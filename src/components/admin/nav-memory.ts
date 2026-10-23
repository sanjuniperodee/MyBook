/**
 * Память навигации CRM на телефоне: направление перехода (для анимации «как в приложении»), вкладка → последняя открытая
 * в ней страница, позиция прокрутки каждой страницы. Живёт в sessionStorage — переживает перезагрузку, но не новую сессию.
 */
export type NavKind = "forward" | "back" | "tab";

const ADMIN = "/admin";

function parts(path: string): string[] {
  const p = path.split(/[?#]/)[0];
  return p.startsWith(ADMIN) ? p.slice(ADMIN.length).split("/").filter(Boolean) : [];
}

/** Раздел (вкладка) по адресу: «/admin/deals/42» → «deals»; доска производства — часть «Заказов»; обзор — пустая строка. */
export function sectionOf(path: string): string {
  const s = parts(path)[0] ?? "";
  return s === "board" ? "orders" : s;
}

/**
 * Что это за переход: вглубь (список → карточка), назад (карточка → список) или смена вкладки/раздела.
 * Тот же адрес (меняются только фильтры) — null: анимировать нечего.
 */
export function navKind(from: string, to: string): NavKind | null {
  const a = parts(from);
  const b = parts(to);
  if (a.join("/") === b.join("/")) return null;
  if (sectionOf(from) !== sectionOf(to)) return "tab";
  if (b.length > a.length) return "forward";
  if (b.length < a.length) return "back";
  return "tab";
}

const SCROLL_KEY = "crm-scroll";
const TAB_KEY = "crm-tab-last";

function read<T>(key: string): Record<string, T> {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? "{}") as Record<string, T>;
  } catch {
    return {};
  }
}
function write(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* приватный режим / переполнение — память просто не работает */
  }
}

export function saveScroll(url: string, y: number) {
  const all = read<number>(SCROLL_KEY);
  all[url] = Math.round(y);
  // Помним последние ~60 страниц, чтобы хранилище не росло бесконечно.
  const keys = Object.keys(all);
  if (keys.length > 60) delete all[keys[0]];
  write(SCROLL_KEY, all);
}
export function savedScroll(url: string): number {
  return read<number>(SCROLL_KEY)[url] ?? 0;
}

export function rememberTab(url: string) {
  const all = read<string>(TAB_KEY);
  all[sectionOf(url)] = url;
  write(TAB_KEY, all);
}
export function lastOfTab(section: string): string | null {
  return read<string>(TAB_KEY)[section] ?? null;
}
