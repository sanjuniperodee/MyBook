// Предзагрузка для kaspi-pos-automation на сервере с PM2: сервис не умеет выбирать адрес и слушает все интерфейсы, а у него
// нет своей авторизации и он держит сессию кассира. Порт без адреса привязываем к 127.0.0.1 (node --require ./localhost.cjs).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- предзагрузка Node — CommonJS
const net = require("node:net");

const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  const port = args[0];
  if (typeof port === "number" || (typeof port === "string" && /^\d+$/.test(port))) {
    const callback = typeof args[args.length - 1] === "function" ? args[args.length - 1] : undefined;
    return listen.call(this, Number(port), "127.0.0.1", callback);
  }
  return listen.apply(this, args);
};
