// Один проход фоновых задач (отложенные сертификаты + автописьма): npm run scheduler:once [-- --any-hour]
import { sendDueGifts } from "../src/lib/gifts";
import { runLifecycle } from "../src/lib/lifecycle";
import { pool } from "../src/lib/db";

const gifts = await sendDueGifts();
const emails = await runLifecycle(new Date(), { ignoreHours: process.argv.includes("--any-hour") });
console.log(`gifts sent: ${gifts}, lifecycle emails: ${emails}`);
await pool.end();
