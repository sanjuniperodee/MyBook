/**
 * Теневая сверка с бэкендом на Nest (ADR 0014): GET на адрес, который Nest уже перенёс, после ответа клиенту повторяется
 * в mybook-backend (127.0.0.1:3046) с теми же заголовками; расхождение статуса или JSON — строка в журнал (путь с
 * замаскированными id и пути отличающихся полей, без значений и личных данных). Клиент получает ответ mybook-api как
 * раньше, Nest его не задерживает. Включение — MYBOOK_NEST_SHADOW=on, доля запросов — MYBOOK_NEST_SHADOW_RATE (0.25).
 * Тяжёлые отчёты, выгрузки, потоки и файлы не сверяются никогда (иначе нагрузка на БД удваивается).
 */
import { currentContext } from "./http/context";

type Handle = (req: Request) => Promise<Response>;

export interface ShadowOptions {
  enabled: boolean;
  rate: number;
  backendUrl: string;
  /** Список адресов Nest обновляется не чаще раза в эту паузу. */
  refreshMs?: number;
  /** Сводка в журнал — раз в этот интервал (0 — не писать). */
  summaryMs?: number;
  log?: (line: string) => void;
  random?: () => number;
}

/** Никогда не сверяются: отчёты и выгрузки (тяжёлые запросы к БД), потоки событий, файлы, картинки и health с timestamp. */
const HEAVY =
  /(?:^|[/_-])(analytics|reports?|exports?|stats|finance|profit|dashboard|digest|live|stream|events|download|files?|media|images?|photos?|pdf|audio|voice|preview|cover-image|package|ical|apk|ipa|health)(?:$|[/_.-])/i;
const DROP_HEADERS = new Set(["host", "content-length", "connection", "keep-alive", "transfer-encoding", "accept-encoding"]);
const MAX_DIFFS = 5;

/** Путь для журнала: uuid, числа и токены — масками. */
export const maskPath = (p: string) =>
  p
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
    .replace(/\/\d+(?=\/|$)/g, "/:n")
    .replace(/\/[A-Za-z0-9_-]{20,}(?=\/|$)/g, "/:token");

/** Пути полей, где ответы различаются (до MAX_DIFFS), без значений. */
export function diffPaths(a: unknown, b: unknown, at = "", out: string[] = []): string[] {
  if (out.length >= MAX_DIFFS) return out;
  if (a === b) return out;
  const oa = a !== null && typeof a === "object";
  const ob = b !== null && typeof b === "object";
  if (!oa || !ob || Array.isArray(a) !== Array.isArray(b)) {
    out.push(at || "(тело)");
    return out;
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length !== b.length) {
    out.push(`${at || "(тело)"}.length`);
    return out;
  }
  const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
  for (const k of keys) diffPaths((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], at ? `${at}.${k}` : k, out);
  return out;
}

const routeRegex = (path: string) =>
  new RegExp(
    `^${path
      .replace(/[.+?^$()|[\]\\]/g, "\\$&")
      .replace(/:\*/g, ".*")
      .replace(/:\w+/g, "[^/]+")
      .replace(/\*/g, ".*")}$`,
  );

export function withShadow(handle: Handle, opts: ShadowOptions): Handle {
  if (!opts.enabled || opts.rate <= 0) return handle;
  const log = opts.log ?? ((line: string) => console.log(line));
  const random = opts.random ?? Math.random;
  const refreshMs = opts.refreshMs ?? 60_000;
  let routes: RegExp[] = [];
  let loadedAt = 0;
  let loading: Promise<void> | null = null;
  const stats = new Map<string, { ok: number; diff: number }>();

  const refresh = () =>
    (loading ??= (async () => {
      try {
        const res = await fetch(`${opts.backendUrl}/api/v1/__nest/routes`, { signal: AbortSignal.timeout(1_000) });
        if (!res.ok) return;
        const body = (await res.json()) as { routes: { method: string; path: string }[] };
        routes = body.routes.filter((r) => r.method === "GET").map((r) => routeRegex(r.path));
      } catch {
        // Ошибка или таймаут не ломает основной запрос — повторим на следующей паузе.
      } finally {
        loadedAt = Date.now();
        loading = null;
      }
    })());

  // Начинаем загрузку списка маршрутов сразу при старте, чтобы к первым запросам он уже был готов.
  void refresh();

  if (opts.summaryMs !== 0) {
    setInterval(() => {
      if (!stats.size) return;
      const parts = [...stats].map(([p, s]) => `${p} ${s.ok}/${s.ok + s.diff}`);
      const diff = [...stats.values()].reduce((n, s) => n + s.diff, 0);
      log(`[shadow] сводка: расхождений ${diff}; ${parts.join(", ")}`);
      stats.clear();
    }, opts.summaryMs ?? 600_000).unref();
  }

  async function compare(req: Request, own: Response, path: string) {
    const headers = new Headers();
    for (const [k, v] of req.headers) if (!DROP_HEADERS.has(k.toLowerCase())) headers.set(k, v);
    const url = new URL(req.url);
    const nest = await fetch(`${opts.backendUrl}${url.pathname}${url.search}`, { headers, redirect: "manual", signal: AbortSignal.timeout(15_000) });
    const [a, b] = await Promise.all([
      own.status === 304 ? Promise.resolve(null) : own.json().catch(() => undefined),
      nest.status === 304 ? Promise.resolve(null) : nest.json().catch(() => undefined),
    ]);
    const diffs = own.status !== nest.status ? [`status ${own.status}/${nest.status}`] : diffPaths(a, b);
    const s = stats.get(path) ?? { ok: 0, diff: 0 };
    stats.set(path, diffs.length ? { ...s, diff: s.diff + 1 } : { ...s, ok: s.ok + 1 });
    if (diffs.length) log(`[shadow] ✗ GET ${path} ${own.status}/${nest.status} Δ ${diffs.join(", ")}`);
  }

  return async (req) => {
    if (!loading && (loadedAt === 0 || Date.now() - loadedAt >= (routes.length ? refreshMs : Math.min(refreshMs, 5_000)))) void refresh();
    const res = await handle(req);
    if (req.method !== "GET") return res;
    const { pathname } = new URL(req.url);
    if (HEAVY.test(pathname) || !routes.some((re) => re.test(pathname))) return res;
    if (res.status !== 304 && !res.headers.get("content-type")?.includes("application/json")) return res;
    if (random() >= opts.rate) return res;
    const own = res.clone();
    const task = () => compare(req, own, maskPath(pathname)).catch((err) => log(`[shadow] ⚠ GET ${maskPath(pathname)}: ${err instanceof Error ? err.message : String(err)}`));
    try {
      currentContext().afterResponse.push(task);
    } catch {
      void task();
    }
    return res;
  };
}
