/**
 * Страница от прошлой выкатки: после выкатки в браузере остаётся старый код, и его вызов серверного действия или
 * догрузка куска JS приходят к новому серверу, который их уже не знает («Failed to find Server Action», ChunkLoadError).
 * Лечится одной полной перезагрузкой страницы: несохранённое в формах переживает её в черновике (lib/form-draft.ts).
 *
 * Здесь — распознавание такой ошибки и защита от петли перезагрузок (не чаще раза в RELOAD_GUARD_MS на вкладку).
 * Перезагрузку и подсказку «Обновили страницу до новой версии» делает components/StaleVersionGuard.tsx.
 */

/** Ключ в sessionStorage: когда вкладку перезагрузили из-за новой версии и показана ли подсказка. */
export const STALE_RELOAD_KEY = "mybook:stale-reload";
/** Вторая такая ошибка раньше этого срока после перезагрузки — не версия, а что-то другое: больше не перезагружаем. */
export const RELOAD_GUARD_MS = 60_000;

const PATTERNS = [
  // Next: клиент — UnrecognizedActionError («Server Action "…" was not found on the server»), сервер — «Failed to find Server Action».
  /Server Action ".*" was not found on the server/i,
  /Failed to find Server Action/i,
  // Пропал кусок JS или CSS прошлой сборки (webpack, Turbopack, динамический import).
  /ChunkLoadError/i,
  /Loading (CSS )?chunk [\w-]+ failed/i,
  /Failed to load chunk/i,
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
];

/** Ошибка — от устаревшей версии страницы (действие или кусок кода прошлой сборки). */
export function isStaleVersionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return typeof error === "string" && PATTERNS.some((re) => re.test(error));
  const e = error as { name?: unknown; message?: unknown };
  if (e.name === "UnrecognizedActionError" || e.name === "ChunkLoadError") return true;
  return typeof e.message === "string" && PATTERNS.some((re) => re.test(e.message as string));
}

interface Mark {
  at: number;
  /** Подсказку после перезагрузки уже показали. */
  shown?: boolean;
}

type Store = Pick<Storage, "getItem" | "setItem">;

function readMark(store: Store): Mark | null {
  try {
    const v = JSON.parse(store.getItem(STALE_RELOAD_KEY) ?? "null") as Mark | null;
    return v && typeof v.at === "number" ? v : null;
  } catch {
    return null;
  }
}

/**
 * Можно ли перезагрузить вкладку из-за новой версии: да — отметка ставится (перезагрузку делает вызывающий),
 * нет — недавно уже перезагружали, ошибка повторилась: петли не будет, человек увидит обычную страницу ошибки.
 * Нет sessionStorage (приватный режим, запрет) — не перезагружаем: без отметки петлю не остановить.
 */
export function claimStaleReload(store: Store, now: number): boolean {
  try {
    const mark = readMark(store);
    if (mark && now - mark.at < RELOAD_GUARD_MS) return false;
    store.setItem(STALE_RELOAD_KEY, JSON.stringify({ at: now } satisfies Mark));
    return true;
  } catch {
    return false;
  }
}

/** После перезагрузки из-за новой версии: показать подсказку один раз (true) — и отметить, что показана. */
export function takeStaleReloadHint(store: Store, now: number): boolean {
  try {
    const mark = readMark(store);
    if (!mark || mark.shown || now - mark.at > RELOAD_GUARD_MS) return false;
    store.setItem(STALE_RELOAD_KEY, JSON.stringify({ ...mark, shown: true } satisfies Mark));
    return true;
  } catch {
    return false;
  }
}

/**
 * Перезагрузить вкладку, если ошибка — от устаревшей версии и петли не будет. Возвращает true, если перезагрузка
 * началась (показывать ошибку не нужно). Только в браузере.
 */
export function reloadIfStale(error: unknown): boolean {
  if (typeof window === "undefined" || !isStaleVersionError(error)) return false;
  let store: Storage;
  try {
    store = window.sessionStorage;
  } catch {
    return false;
  }
  if (!claimStaleReload(store, Date.now())) return false;
  window.location.reload();
  return true;
}
