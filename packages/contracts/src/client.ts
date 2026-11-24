/**
 * TS-клиент API v1 для веба (и скриптов): типы запросов и ответов — из контракта (v1/routes.ts), без генерации кода.
 *   const api = createApiClient({ baseUrl: "http://127.0.0.1:3060", token });
 *   const { books } = await api.booksList({});
 *   await api.questionSave({ bookId, questionId, body: { answer } });
 * Ошибка — ApiClientError со статусом, текстом для экрана и кодом.
 */
import { v1, type Input, type Output, type RouteDef, type RouteName } from "./v1/routes";

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string | undefined,
    message: string,
  ) {
    super(message);
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Bearer-токен сессии (мобильное приложение, скрипты); веб на сервере передаёт cookie через headers. */
  token?: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
}

export type ApiClient = { [N in RouteName]: (input: Input<N>) => Promise<Output<N>> };

/** Путь с подставленными параметрами и строкой запроса. */
export function buildUrl(r: RouteDef, input: Record<string, unknown>): string {
  const used = new Set<string>();
  const path = r.path.replace(/\{(\w+)\}/g, (_, k: string) => {
    used.add(k);
    return encodeURIComponent(String(input[k]));
  });
  const q = new URLSearchParams();
  if (r.query) for (const k of Object.keys(r.query.shape)) if (input[k] !== undefined && !used.has(k)) q.set(k, String(input[k]));
  const qs = q.toString();
  return qs ? `${path}?${qs}` : path;
}

export function createApiClient(opts: ApiClientOptions): ApiClient {
  const f = opts.fetch ?? fetch;
  const client = {} as Record<string, (input: Record<string, unknown>) => Promise<unknown>>;
  for (const [name, r] of Object.entries(v1) as [RouteName, RouteDef][]) {
    client[name] = async (input = {}) => {
      const headers: Record<string, string> = { accept: "application/json", ...opts.headers };
      if (opts.token) headers.authorization = `Bearer ${opts.token}`;
      if (r.body) headers["content-type"] = "application/json";
      const res = await f(opts.baseUrl + buildUrl(r, input), { method: r.method, headers, body: r.body ? JSON.stringify(input.body ?? {}) : undefined });
      const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (!res.ok) throw new ApiClientError(res.status, data.code, data.error ?? res.statusText);
      return data;
    };
  }
  return client as unknown as ApiClient;
}
