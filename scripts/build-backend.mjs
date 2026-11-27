// Собирает бэкенд на NestJS (apps/backend/src/main.ts, ADR 0014) в build/backend.mjs — весь API MyBooks.
// Свой tsconfig: декораторы Nest (experimentalDecorators). Необязательные пакеты Nest (микросервисы, веб-сокеты,
// class-validator) процесс не использует — они вне бандла.
import { bundleNodeProcess } from "./node-bundle.mjs";

await bundleNodeProcess({
  name: "backend",
  entry: "apps/backend/src/main.ts",
  tsconfig: "apps/backend/tsconfig.json",
  optional: ["@nestjs/microservices", "@nestjs/microservices/*", "@nestjs/websockets", "@nestjs/websockets/*", "@nestjs/platform-express", "class-transformer", "class-validator", "@fastify/static", "@fastify/view"],
});
