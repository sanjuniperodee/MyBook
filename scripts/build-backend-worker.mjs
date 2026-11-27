// Собирает процесс-воркер на Nest (apps/backend/src/worker.ts, ADR 0014, шаг 6) в build/backend-worker.mjs —
// рядом с worker.mjs. Фон тот же (src/worker/run.ts); вне HTTP-запроса данные запроса — понятная ошибка, after() —
// сразу (src/shared/infrastructure/http). Свой tsconfig — декораторы Nest.
import { bundleNodeProcess } from "./node-bundle.mjs";

await bundleNodeProcess({
  name: "backend-worker",
  entry: "apps/backend/src/worker.ts",
  tsconfig: "apps/backend/tsconfig.json",
  optional: ["@nestjs/microservices", "@nestjs/microservices/*", "@nestjs/websockets", "@nestjs/websockets/*", "@nestjs/platform-express", "class-transformer", "class-validator", "@fastify/static", "@fastify/view"],
});
