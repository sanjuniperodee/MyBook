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
    ...sidecars,
  ],
};
