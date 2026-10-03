// PM2-конфиг MyBooks. Запускается из корня репозитория на сервере: pm2 start deploy/ecosystem.config.cjs
// Запускается релиз из ../mybook-releases/current → releases/<время>-<sha> (его создаёт deploy/deploy.sh), а не папка сборки.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- PM2 читает CommonJS-конфиг
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const releasesDir = process.env.MYBOOK_RELEASES_DIR || path.join(path.dirname(root), "mybook-releases");

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
      max_memory_restart: "1500M",
      // Next ждёт закрытия долгих соединений (поток админки, keep-alive nginx) и без этого останавливается все 10 с —
      // столько длилось бы окно 502 при каждом деплое. 3 с хватает дописать обычные запросы.
      kill_timeout: 3000,
      time: true,
    },
  ],
};
