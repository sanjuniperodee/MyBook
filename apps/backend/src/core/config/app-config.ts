import { z } from "zod";

/**
 * Настройки процесса из окружения — один раз при запуске, со схемой: опечатка в порте или пустой APP_URL роняют запуск,
 * а не первый запрос. Остальные переменные (БД, Redis, хранилище) читают свои модули инфраструктуры.
 */
const Env = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  BACKEND_HOST: z.string().default("127.0.0.1"),
  BACKEND_PORT: z.coerce.number().int().min(1).max(65535).default(3046),
  APP_URL: z.url().default("http://localhost:3000").transform((u) => u.replace(/\/$/, "")),
  /** Общий секрет с фронтом на Vercel: подпись адреса клиента (src/shared/clientIp.ts). */
  EDGE_IP_SECRET: z.string().min(16).optional(),
});

export interface AppConfig {
  readonly production: boolean;
  readonly host: string;
  readonly port: number;
  readonly appUrl: string;
  readonly edgeIpSecret: string | undefined;
}

export const APP_CONFIG = Symbol("AppConfig");

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const env = Env.parse(source);
  return { production: env.NODE_ENV === "production", host: env.BACKEND_HOST, port: env.BACKEND_PORT, appUrl: env.APP_URL, edgeIpSecret: env.EDGE_IP_SECRET };
}
