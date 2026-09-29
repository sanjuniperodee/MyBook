export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.SKIP_AUTO_MIGRATE === "1") return;
  const { runMigrations } = await import("./lib/db/migrate");
  try {
    await runMigrations();
    console.log("[mybook] database migrations applied");
  } catch (err) {
    console.error("[mybook] failed to apply migrations", err);
    throw err;
  }
}
