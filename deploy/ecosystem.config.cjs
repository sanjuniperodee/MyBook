// PM2-конфиг MyBooks. Запускается из корня репозитория на сервере: pm2 start deploy/ecosystem.config.cjs
// eslint-disable-next-line @typescript-eslint/no-require-imports -- PM2 читает CommonJS-конфиг
const path = require("node:path");

const root = path.resolve(__dirname, "..");

module.exports = {
  apps: [
    {
      name: "mybook",
      cwd: path.join(root, ".next/standalone"),
      script: "server.js",
      // .env из корня репозитория (DATABASE_URL, APP_URL, SMTP и т.д.)
      node_args: `--env-file=${path.join(root, ".env")}`,
      env: {
        NODE_ENV: "production",
        PORT: process.env.MYBOOK_PORT || "3040",
        HOSTNAME: "127.0.0.1",
        TZ: "Asia/Almaty",
      },
      max_memory_restart: "1500M",
      kill_timeout: 10000,
      time: true,
    },
  ],
};
