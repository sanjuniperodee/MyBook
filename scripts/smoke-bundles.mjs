// Проверка релиза до выкатки: процессы mybook-api, mybook-worker и mybook-backend из .next/standalone запускаются и находят все свои
// пакеты (26.11 mybook-api дважды не стартовал на проде: «Cannot find package 'pg'», затем «remove-trailing-separator»).
// БД не нужна: миграции выключены, база — заведомо недоступный адрес; ждём до 15 с и ищем ошибки загрузки модулей
// (другие ошибки запуска без БД и без папки drizzle — не повод).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const DIR = path.resolve(process.argv[2] ?? ".next/standalone");
const ENV = { ...process.env, SKIP_AUTO_MIGRATE: "1", API_PORT: "39444", API_HOST: "127.0.0.1", BACKEND_PORT: "39445", DATABASE_URL: "postgres://mybook:x@127.0.0.1:1/none", SCHEDULER: "off", NODE_ENV: "production" };
const BAD = /ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|Cannot find (package|module)/;

function run(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [file], { cwd: DIR, env: ENV });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), 15_000);
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ file, ok: !BAD.test(out), out, code, signal });
    });
  });
}

// backend.mjs и backend-worker.mjs — бэкенд и воркер на Nest (ADR 0014); в релизах до них их нет.
const NEST = ["backend.mjs", "backend-worker.mjs"];
const results = await Promise.all(["api.mjs", "worker.mjs", ...NEST].filter((f) => !NEST.includes(f) || existsSync(path.join(DIR, f))).map(run));
for (const r of results) {
  console.log(`${r.file}: ${r.ok ? "запускается" : "НЕ ЗАПУСКАЕТСЯ"}`);
  if (!r.ok) console.log(r.out.split("\n").slice(0, 30).join("\n"));
}
if (results.some((r) => !r.ok)) process.exit(1);
