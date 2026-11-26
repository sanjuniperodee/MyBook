// Запуск веба на Node.js: только часы визуальных тестов. Подключается только из instrumentation.ts в рантайме nodejs.

/**
 * Визуальные тесты: фиксируем часы сервера, чтобы относительные даты («сегодня», «2 дня назад»)
 * не менялись от прогона к прогону. Включается только при VISUAL_NOW и (в production-сборке)
 * явном VISUAL_TEST=1: в обычном проде переменные не заданы, и подмена не устанавливается.
 */
function installVisualClock() {
  const fixed = process.env.VISUAL_NOW;
  if (!fixed || (process.env.NODE_ENV === "production" && process.env.VISUAL_TEST !== "1")) return;
  const ts = Date.parse(fixed);
  if (!Number.isFinite(ts)) {
    console.warn(`[visual] VISUAL_NOW not a date: ${fixed}`);
    return;
  }
  const RealDate = Date;
  const VisualDate = new Proxy(RealDate, {
    construct(target, args) {
      return Reflect.construct(target, args.length ? args : [ts]);
    },
    apply(target) {
      return new target(ts).toString();
    },
    get(target, prop, receiver) {
      if (prop === "now") return () => ts;
      return Reflect.get(target, prop, receiver);
    },
  });
  globalThis.Date = VisualDate as DateConstructor;
  console.log(`[visual] server clock fixed at ${new RealDate(ts).toISOString()}`);
}

/**
 * Веб (ADR 0013): только страницы через API v1 — миграции БД, фон, синхронизация каталога и замеры памяти живут в
 * mybook-api и mybook-worker (apps/api/src/main.ts, src/worker).
 */
export async function registerNode() {
  installVisualClock();
}
