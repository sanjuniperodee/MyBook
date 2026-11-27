// Собирает процесс фоновой работы (src/worker/main.ts) в build/worker.mjs, откуда его
// запускает PM2 (mybook-worker, deploy/ecosystem.config.cjs). Общие настройки — scripts/node-bundle.mjs.
// next/* — заглушка: фон не работает в HTTP-запросе, а код Next вне своего сервера не загружается.
import { bundleNodeProcess } from "./node-bundle.mjs";

await bundleNodeProcess({ name: "worker", entry: "src/worker/main.ts" });
