export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: unknown, meta?: Record<string, unknown>): void;
}

export const consoleLogger = (scope: string): Logger => ({
  info: (m, meta) => console.log(`[${scope}] ${m}`, meta ?? ""),
  warn: (m, meta) => console.warn(`[${scope}] ${m}`, meta ?? ""),
  error: (m, err, meta) => console.error(`[${scope}] ${m}`, err ?? "", meta ?? ""),
});
