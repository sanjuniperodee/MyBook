import "server-only";
import { describeDiff, diffValues, normalize, type ParityDiff } from "@/shared/parity/normalize";

/**
 * Сравнение in-process и HTTP-ответов на время переезда (волна 1).
 *
 * Важно: parityCall — только для чтения. Команды (оплата, отправка сообщения, создание заказа)
 * нельзя вызывать дважды: побочные эффекты удвоятся. Для команд используйте обычный путь.
 */

export type ParityMode = "off" | "shadow" | "strict";

export function parityMode(value: string | undefined = process.env.PARITY_MODE): ParityMode {
  return value === "shadow" || value === "strict" ? value : "off";
}

export interface ParityTransport {
  call(path: string, args: readonly unknown[]): Promise<unknown>;
}

export interface ParityLogger {
  warn(...args: unknown[]): void;
}

export class ParityError extends Error {
  readonly code = "parity_mismatch";
  constructor(
    readonly path: string,
    readonly diffs: ParityDiff[],
  ) {
    super(`Parity mismatch in ${path}: ${diffs.length} field(s)`);
    this.name = "ParityError";
  }
  static is(err: unknown): err is ParityError {
    return err instanceof ParityError || (!!err && typeof err === "object" && (err as { code?: string }).code === "parity_mismatch");
  }
}

/** Разрешает `reporting.dealCard` в функцию и её `this` (модули — объекты с методами). */
export function resolveMethod(root: unknown, path: string): { parent: unknown; fn: (...args: unknown[]) => unknown } {
  const parts = path.split(".").filter(Boolean);
  if (!parts.length) throw new Error("parity: empty path");
  let parent: unknown = root;
  let current: unknown = root;
  for (const part of parts) {
    parent = current;
    if (!current || (typeof current !== "object" && typeof current !== "function")) {
      throw new Error(`parity: ${path} — ${part} not found`);
    }
    current = (current as Record<string, unknown>)[part];
  }
  if (current === undefined || current === null) throw new Error(`parity: ${path} — not found`);
  if (typeof current !== "function") throw new Error(`parity: ${path} — not a function`);
  return { parent, fn: current as (...args: unknown[]) => unknown };
}

/** Транспорт «в процессе»: вызывает реальный container. Для тестов можно передать свой root. */
export function createInProcessTransport(root: unknown): ParityTransport {
  return {
    async call(path, args) {
      const { parent, fn } = resolveMethod(root, path);
      return fn.apply(parent, args as unknown[]);
    },
  };
}

/** Серверный транспорт по умолчанию: лениво подтягивает container, чтобы модуль был тестируемым. */
export async function createServerTransport(): Promise<ParityTransport> {
  const { container } = await import("./container");
  return createInProcessTransport(container());
}

export interface HttpTransportOptions {
  baseUrl: string;
  token?: string;
  /** Таймаут одного вызова, мс. */
  timeoutMs?: number;
}

/**
 * HTTP-транспорт для волны 1. Endpoint `/internal/v1/parity` появится вместе с `apps/api`;
 * до этого вызов вернёт ошибку — это ожидаемо.
 */
export function createHttpTransport({ baseUrl, token, timeoutMs = 30_000 }: HttpTransportOptions): ParityTransport {
  const base = baseUrl.replace(/\/$/, "");
  return {
    async call(path, args) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`${base}/internal/v1/parity`, {
          method: "POST",
          headers: { "content-type": "application/json", ...(token ? { "x-internal-token": token } : {}) },
          body: JSON.stringify({ path, args }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`parity http ${res.status} ${path}`);
        const body = (await res.json()) as { ok?: boolean; data?: unknown; error?: { message?: string } };
        if (!body.ok) throw new Error(body.error?.message ?? `parity http error ${path}`);
        return body.data;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * Вызывает локальный путь и, если задан remote, сравнивает ответы.
 * off — только локально; shadow — расхождения в лог, ответ локальный; strict — расхождение = ошибка.
 */
export async function parityCall<T>(
  path: string,
  args: readonly unknown[],
  local: () => Promise<T>,
  remote?: ParityTransport,
  logger: ParityLogger = console,
): Promise<T> {
  const mode = parityMode();
  if (mode === "off" || !remote) return local();

  const [localResult, remoteResult] = await Promise.allSettled([local(), remote.call(path, args)]);
  if (localResult.status === "rejected") throw localResult.reason;

  if (remoteResult.status === "rejected") {
    logger.warn(`[parity] ${path}: remote failed`, remoteResult.reason);
    if (mode === "strict") throw remoteResult.reason;
    return localResult.value;
  }

  const diffs = diffValues(normalize(localResult.value), normalize(remoteResult.value));
  if (diffs.length) {
    logger.warn(`[parity] ${path}: ${diffs.length} mismatch`, diffs.slice(0, 10).map((d) => describeDiff(d)));
    if (mode === "strict") throw new ParityError(path, diffs);
  }
  return localResult.value;
}
