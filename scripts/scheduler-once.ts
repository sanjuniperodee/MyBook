// Один проход фоновых задач (отложенные сертификаты, автописьма, правила CRM по времени): npm run scheduler:once [-- --any-hour]
import { sendDueGifts } from "../src/lib/gifts";
import { runLifecycle } from "../src/lib/lifecycle";
import { runScheduledAutomations } from "../src/lib/crm/automations";
import { pool } from "../src/lib/db";

const gifts = await sendDueGifts();
const emails = await runLifecycle(new Date(), { ignoreHours: process.argv.includes("--any-hour") });
const crm = await runScheduledAutomations();
console.log(`gifts sent: ${gifts}, lifecycle emails: ${emails}, crm automations: ${crm}`);
await pool.end();
