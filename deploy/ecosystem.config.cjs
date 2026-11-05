// PM2-конфиг MyBooks. Запускается из корня репозитория на сервере: pm2 start deploy/ecosystem.config.cjs
// Запускается релиз из ../mybook-releases/current → releases/<время>-<sha> (его создаёт deploy/deploy.sh), а не папка сборки.
// Рядом — сервисы Kaspi Pay и WhatsApp, если они установлены (bash deploy/sidecars.sh); деплой сайта их не перезапускает.
/* eslint-disable @typescript-eslint/no-require-imports -- PM2 читает CommonJS-конфиг */
const fs = require("node:fs");
const path = require("node:path");
/* eslint-enable @typescript-eslint/no-require-imports */

const root = path.resolve(__dirname, "..");
const releasesDir = process.env.MYBOOK_RELEASES_DIR || path.join(path.dirname(root), "mybook-releases");
const sidecarsDir = process.env.MYBOOK_SIDECARS_DIR || path.join(path.dirname(root), "mybook-sidecars");

/** Сервисы рядом с сайтом: каждый — только если установлен. Порты и секреты — в .env в папке сервиса. */
const sidecars = [
  fs.existsSync(path.join(sidecarsDir, "kaspi-pos", "server.js")) && {
    name: "mybook-kaspi-pos",
    cwd: path.join(sidecarsDir, "kaspi-pos"),
    script: "server.js",
    node_args: "--require ./localhost.cjs",
    env: { NODE_ENV: "production", TZ: "Asia/Almaty" },
    max_memory_restart: "300M",
    time: true,
  },
  fs.existsSync(path.join(sidecarsDir, "gowa", "whatsapp")) && {
    name: "mybook-gowa",
    cwd: path.join(sidecarsDir, "gowa"),
    script: "./whatsapp",
    args: "rest",
    interpreter: "none",
    max_memory_restart: "500M",
    time: true,
  },
].filter(Boolean);

/**
 * Распределитель памяти jemalloc вместо malloc glibc для сайта и mybook-worker (ADR 0010): sharp/libvips и вёрстка PDF
 * выделяют сотни МБ на короткое время, а malloc glibc почти не возвращает их системе — после прогрева фото-обложек сайт
 * держал ~1,2 ГБ. jemalloc с фоновым потоком отдаёт освободившееся через ~1 с. Нет библиотеки (apt install libjemalloc2)
 * или MYBOOK_JEMALLOC=off — обычный malloc, как раньше.
 */
const jemallocLib = process.env.MYBOOK_JEMALLOC || "/usr/lib/x86_64-linux-gnu/libjemalloc.so.2";
const allocatorEnv =
  process.env.MYBOOK_JEMALLOC !== "off" && fs.existsSync(jemallocLib)
    ? { LD_PRELOAD: jemallocLib, MALLOC_CONF: "background_thread:true,dirty_decay_ms:1000,muzzy_decay_ms:0" }
    : {};

/**
 * Фоновая работа (планировщик, сверка Kaspi, outbox, бот, IMAP, очередь видео) — отдельным процессом mybook-worker
 * (ADR 0009), если он есть в релизе (worker.mjs рядом с server.js). Тогда сайту ставится MYBOOK_BACKGROUND=worker, и он
 * фон не запускает. Откат на «всё в одном процессе» — MYBOOK_WORKER=off при запуске PM2 (deploy/deploy.sh делает это
 * сам, если воркер не поднялся) или релиз без worker.mjs.
 */
const workerFile = path.join(releasesDir, "current", "worker.mjs");
const useWorker = process.env.MYBOOK_WORKER !== "off" && fs.existsSync(workerFile);

const worker = useWorker && {
  name: "mybook-worker",
  cwd: path.join(releasesDir, "current"),
  script: "worker.mjs",
  node_args: `--env-file=${path.join(root, ".env")}`,
  env: { NODE_ENV: "production", TZ: "Asia/Almaty", ...allocatorEnv },
  // Фон рисует PDF подарочных сертификатов и предпросмотры (поток вёрстки — до ~1 ГБ на пике); обычно ~200–300 МБ.
  max_memory_restart: "1500M",
  kill_timeout: 5000,
  time: true,
};

module.exports = {
  apps: [
    {
      name: "mybook",
      cwd: path.join(releasesDir, "current"),
      script: "server.js",
      // .env из корня репозитория (DATABASE_URL, APP_URL, SMTP и т.д.)
      node_args: `--env-file=${path.join(root, ".env")}`,
      env: {
        NODE_ENV: "production",
        PORT: process.env.MYBOOK_PORT || "3040",
        // Именно localhost: Next сверяет адрес сервера с localhost из proxy.ts (/kk → rewrite). При 127.0.0.1
        // rewrite считается внешним и за https-прокси падает с EPROTO. Слушает localhost на ::1 или 127.0.0.1 — nginx обращается к localhost.
        HOSTNAME: "localhost",
        TZ: "Asia/Almaty",
        ...(useWorker ? { MYBOOK_BACKGROUND: "worker" } : {}),
        ...allocatorEnv,
      },
      // Сборка PDF книги с фото занимает до ~1 ГБ сверх обычных ~0,5 ГБ: при 1500M PM2 убивал процесс посреди генерации,
      // и сайт на секунды отдавал 502. Сервер 8 ГБ, остальные процессы ~2,4 ГБ; запас ~1,5 ГБ — копии на время выкатки
      // (smoke-тест) и всплескам соседей. Лимит остаётся страховкой от утечки: без него процесс съел бы память всего сервера.
      // Сервер уменьшат до 4 ГБ — лимит снизить (~1500M).
      max_memory_restart: "4000M",
      // Next ждёт закрытия долгих соединений (поток админки, keep-alive nginx) и без этого останавливается все 10 с —
      // столько длилось бы окно 502 при каждом деплое. 3 с хватает дописать обычные запросы.
      kill_timeout: 3000,
      time: true,
    },
    ...(worker ? [worker] : []),
    ...sidecars,
  ],
};
