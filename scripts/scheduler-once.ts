// Один проход фоновых задач (отложенные сертификаты, автописьма, правила CRM по времени): npm run scheduler:once [-- --any-hour]
import { container } from "../src/server/container";
import { pool } from "../src/lib/db";

const gifts = await container().ordering.deliverDueGifts();
const emails = await container().notifications.lifecycle.run({ ignoreHours: process.argv.includes("--any-hour") });
const crm = await container().automation.engine.runScheduled({ force: true });
console.log(`gifts sent: ${gifts}, lifecycle emails: ${emails}, crm automations: ${crm}`);
await pool.end();
