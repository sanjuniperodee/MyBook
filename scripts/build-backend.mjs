// Собирает бэкенд на NestJS (apps/backend/src/main.ts, ADR 0014) в build/backend.mjs — весь API MyBooks.
// Свой tsconfig: декораторы Nest (experimentalDecorators). Старый контейнер (apps/backend/src/legacy) ещё тянет код
// с next/* — его заменяет прокладка запроса (src/server/http/next-shim.ts). Необязательные пакеты Nest (микросервисы, веб-сокеты,
// class-validator) процесс не использует — они вне бандла.
import { bundleNodeProcess } from "./node-bundle.mjs";

await bundleNodeProcess({
  name: "backend",
  entry: "apps/backend/src/main.ts",
  nextShim: "./src/server/http/next-shim.ts",
  tsconfig: "apps/backend/tsconfig.json",
  optional: ["@nestjs/microservices", "@nestjs/microservices/*", "@nestjs/websockets", "@nestjs/websockets/*", "@nestjs/platform-express", "class-transformer", "class-validator", "@fastify/static", "@fastify/view"],
});
