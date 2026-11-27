// Собирает процесс-воркер на Nest (apps/backend/src/worker.ts, ADR 0014, шаг 6) в .next/standalone/backend-worker.mjs —
// рядом с worker.mjs. Фон тот же (src/worker/run.ts), поэтому next/* — заглушка воркера (вызов вне HTTP-запроса —
// понятная ошибка, after() — сразу), а не прокладка запроса API. Свой tsconfig — декораторы Nest.
import { bundleNodeProcess } from "./node-bundle.mjs";

await bundleNodeProcess({
  name: "backend-worker",
  entry: "apps/backend/src/worker.ts",
  nextShim: "./scripts/worker-next-shim.mjs",
  tsconfig: "apps/backend/tsconfig.json",
  optional: ["@nestjs/microservices", "@nestjs/microservices/*", "@nestjs/websockets", "@nestjs/websockets/*", "@nestjs/platform-express", "class-transformer", "class-validator", "@fastify/static", "@fastify/view"],
});
