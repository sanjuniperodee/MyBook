/**
 * Шежіре: родословная до седьмого колена (жеті ата). Данные хранятся только в браузере человека (localStorage),
 * на сервер ничего не уходит. Модуль — модель, проверка сохранённого и текст для копирования.
 */
export const GENERATIONS = 7;
const FIELD_MAX = 80;
export const STORAGE_KEY = "mb_shezhire_v1";

export interface Ancestor {
  name: string;
  years: string;
  place: string;
}

export interface Shezhire {
  owner: string;
  /** Род и жуз — по желанию. */
  clan: string;
  /** Линия отца: отец, дед, прадед… — до седьмого колена. */
  father: Ancestor[];
  /** Линия матери (нағашы). */
  mother: Ancestor[];
}

export const emptyAncestor = (): Ancestor => ({ name: "", years: "", place: "" });
export const emptyShezhire = (): Shezhire => ({ owner: "", clan: "", father: Array.from({ length: GENERATIONS }, emptyAncestor), mother: Array.from({ length: GENERATIONS }, emptyAncestor) });

const clean = (v: unknown) => (typeof v === "string" ? v.slice(0, FIELD_MAX) : "");

function ancestors(v: unknown): Ancestor[] {
  const list = Array.isArray(v) ? v : [];
  return Array.from({ length: GENERATIONS }, (_, i) => {
    const a = (list[i] ?? {}) as Partial<Ancestor>;
    return { name: clean(a.name), years: clean(a.years), place: clean(a.place) };
  });
}

/** Читает сохранённое: испорченное, чужое и неполное превращается в пустую или дополненную родословную, а не в ошибку. */
export function parseShezhire(raw: string | null): Shezhire {
  if (!raw) return emptyShezhire();
  try {
    const v = JSON.parse(raw) as Partial<Shezhire> | null;
    if (!v || typeof v !== "object") return emptyShezhire();
    return { owner: clean(v.owner), clan: clean(v.clan), father: ancestors(v.father), mother: ancestors(v.mother) };
  } catch {
    return emptyShezhire();
  }
}

/** Сколько поколений заполнено подряд с первого: родословная «обрывается» на первом пустом колене. */
export function knownChain(list: readonly Ancestor[]): number {
  let n = 0;
  for (const a of list) {
    if (!a.name.trim()) break;
    n++;
  }
  return n;
}

export const filled = (list: readonly Ancestor[]) => list.filter((a) => a.name.trim()).length;

export function ancestorLine(a: Ancestor): string {
  const extra = [a.years.trim(), a.place.trim()].filter(Boolean).join(", ");
  return extra ? `${a.name.trim()} (${extra})` : a.name.trim();
}

/**
 * Список имён из вставленного текста: через запятую, точку с запятой, перенос строки, тире или стрелку. Если разделителей нет,
 * а слов от двух до семи, каждое слово — отдельное имя («Серік Қали Омар»). Лишнее после седьмого колена отбрасывается.
 */
export function parseNames(text: string): string[] {
  const t = text.trim();
  if (!t) return [];
  const bySeparator = t.split(/[\n,;→>—–]+|\s-\s/).map((s) => s.trim());
  const parts = bySeparator.length > 1 ? bySeparator : t.split(/\s+/);
  return parts.filter(Boolean).map((s) => s.slice(0, FIELD_MAX)).slice(0, GENERATIONS);
}

/** Сколько колен показывает плакат: до последнего известного имени (пробелы между ними остаются «—»). */
export function posterDepth(list: readonly Ancestor[]): number {
  for (let i = list.length - 1; i >= 0; i--) if (list[i].name.trim()) return i + 1;
  return 0;
}
