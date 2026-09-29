import { runMigrations } from "../src/lib/db/migrate";
import { pool } from "../src/lib/db";

runMigrations()
  .then(() => console.log("Migrations applied"))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
