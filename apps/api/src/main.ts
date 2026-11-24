/**
 * Процесс mybook-api (ADR 0012): API v1 (/api/v1/*) поверх сервисов модулей — для мобильного приложения и, по разделам,
 * для веба. Слушает 127.0.0.1:API_PORT (3060); снаружи — через nginx (location /api/v1/) или переписывание Next.
 * Фоновых проходов не запускает (они в mybook-worker). Собирается scripts/build-api.mjs в .next/standalone/api.mjs.
 */
import { startPerfSampler } from "@/shared/infrastructure/perfLog";
import { configureSharpMemory } from "@/shared/infrastructure/sharpMemory";
import { createApp } from "./app";
import { siteAuthenticator } from "./auth";
import { serve } from "./http/server";
import { handlers } from "./routes";

const port = Number(process.env.API_PORT) || 3060;
const host = process.env.API_HOST || "127.0.0.1";

await configureSharpMemory();
startPerfSampler();
const server = serve(createApp(handlers, siteAuthenticator), { port, host });
server.on("listening", () => console.log(`[api] v1 на ${host}:${port} (pid ${process.pid})`));

const stop = (signal: string) => {
  console.log(`[api] ${signal}, останавливаюсь`);
  server.close();
  setTimeout(() => process.exit(0), 5_000).unref();
};
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));
