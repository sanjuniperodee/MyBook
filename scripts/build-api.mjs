// Собирает API v1 (apps/api/src/main.ts, ADR 0012) в .next/standalone/api.mjs — рядом с server.js, откуда его запускает
// PM2 (mybook-api, deploy/ecosystem.config.cjs). next/headers и next/server — из текущего запроса (apps/api/src/http/next-shim.ts).
import { bundleNodeProcess } from "./node-bundle.mjs";

await bundleNodeProcess({ name: "api", entry: "apps/api/src/main.ts", nextShim: "./apps/api/src/http/next-shim.ts" });
