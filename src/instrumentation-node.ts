// Запуск на Node.js-сервере: миграции БД и фоновые задачи. Подключается только из instrumentation.ts в рантайме nodejs.
export async function registerNode() {
  if (process.env.SKIP_AUTO_MIGRATE !== "1") {
    const { runMigrations } = await import("./lib/db/migrate");
    try {
      await runMigrations();
      console.log("[mybook] database migrations applied");
    } catch (err) {
      console.error("[mybook] failed to apply migrations", err);
      throw err;
    }
  }
  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
