// Собирает бэкенд на NestJS (apps/backend/src/main.ts, ADR 0014) в .next/standalone/backend.mjs — рядом с api.mjs.
// Свой tsconfig: декораторы Nest (experimentalDecorators). Старый контейнер (apps/backend/src/legacy) ещё тянет код
// с next/* — его, как у mybook-api, заменяет прокладка запроса. Необязательные пакеты Nest (микросервисы, веб-сокеты,
// class-validator) процесс не использует — они вне бандла.
import { bundleNodeProcess } from "./node-bundle.mjs";

await bundleNodeProcess({
  name: "backend",
  entry: "apps/backend/src/main.ts",
  nextShim: "./apps/api/src/http/next-shim.ts",
  tsconfig: "apps/backend/tsconfig.json",
  optional: ["@nestjs/microservices", "@nestjs/microservices/*", "@nestjs/websockets", "@nestjs/websockets/*", "@nestjs/platform-express", "class-transformer", "class-validator", "@fastify/static", "@fastify/view"],
});
