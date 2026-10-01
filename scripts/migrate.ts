import { runMigrations } from "@/shared/infrastructure/db/migrate";
import { pool } from "@/shared/infrastructure/db";

runMigrations()
  .then(() => console.log("Migrations applied"))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
