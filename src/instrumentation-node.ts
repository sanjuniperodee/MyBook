// Запуск на Node.js-сервере: миграции БД и фоновые задачи. Подключается только из instrumentation.ts в рантайме nodejs.

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

export async function registerNode() {
  installVisualClock();
  const { configureSharpMemory } = await import("@/shared/infrastructure/sharpMemory");
  await configureSharpMemory();
  if (process.env.SKIP_AUTO_MIGRATE !== "1") {
    const { runMigrations } = await import("@/shared/infrastructure/db/migrate");
    try {
      await runMigrations();
      console.log("[mybook] database migrations applied");
    } catch (err) {
      console.error("[mybook] failed to apply migrations", err);
      throw err;
    }
  }
  const { startCatalogSync } = await import("@/server/catalog");
  startCatalogSync();
  // Фон — здесь же или в отдельном процессе mybook-worker (deploy/ecosystem.config.cjs ставит MYBOOK_BACKGROUND=worker).
  const { backgroundInWorker, startBackground } = await import("@/server/background");
  if (backgroundInWorker()) console.log("[mybook] background jobs run in mybook-worker");
  else await startBackground();
}
