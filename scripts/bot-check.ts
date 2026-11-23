// Живая проверка AI-продажника: сценарии из JSON прогоняются тем же ходом, что «Проверить бота» в настройках
// (previewBot — без записи в базу и без отправки клиенту), на сохранённых настройках бота и настоящей модели.
// Голосовое — файл (ogg/mp3/wav): его распознаёт модель «Голосовые и фото», расшифровка идёт в беседу, как в чате.
//
//   npx tsx scripts/bot-check.ts scenarios.json [--only id1,id2] [--json out.json]
//
// scenarios.json: [{ "id": "price", "title": "Цена", "workTime": true, "turns": [["Сколько стоит?"], [{ "audio": "voice.ogg" }]] }]
import { readFileSync, writeFileSync } from "node:fs";
import { container } from "../src/server/container";
import { pool } from "@/shared/infrastructure/db";
import { getSetting } from "@/modules/workspace/infrastructure/settings";
import { parseBotConfig } from "@/modules/messaging/domain/botConfig";
import { SELLER_MEDIA_PROMPT } from "@/modules/messaging/application/botSeller";

type Msg = string | { audio: string; mime?: string };
interface Scenario {
  id: string;
  title?: string;
  workTime?: boolean;
  client?: "new" | "account";
  name?: string;
  turns: Msg[][];
}

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) throw new Error("Укажите файл сценариев");
const only = args.includes("--only") ? new Set(args[args.indexOf("--only") + 1].split(",")) : null;
const out = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const scenarios = (JSON.parse(readFileSync(file, "utf8")) as Scenario[]).filter((s) => !only || only.has(s.id));

const c = container();
const config = parseBotConfig(await getSetting("bot.config"));
const results: unknown[] = [];

async function transcribe(path: string, mime: string): Promise<string> {
  const data = readFileSync(path).toString("base64");
  const res = await c.assistant.seller.media({ system: SELLER_MEDIA_PROMPT.audio, parts: [{ kind: "audio", data, mime }], timeoutMs: 60_000 }).catch((e: unknown) => ({ error: String(e) }));
  if (!res) return "⚠️ распознавание: временный сбой";
  if ("unsupported" in res) return `⚠️ распознавание не умеет: ${res.reason ?? ""}`;
  if ("error" in res) return `⚠️ ${res.error}`;
  return res.text;
}

for (const s of scenarios) {
  const turns: { text: string; type: "text" }[][] = [];
  for (const t of s.turns) {
    const turn: { text: string; type: "text" }[] = [];
    for (const m of t) {
      if (typeof m === "string") turn.push({ text: m, type: "text" });
      else {
        const heard = await transcribe(m.audio, m.mime ?? "audio/ogg");
        console.log(`  [${s.id}] голосовое ${m.audio} → ${heard}`);
        turn.push({ text: `[Голосовое клиента: ${heard}]`, type: "text" });
      }
    }
    turns.push(turn);
  }
  const t0 = Date.now();
  const r = await c.messaging.previewBot({ config, turns, workTime: s.workTime ?? true, client: s.client ?? "new", name: s.name ?? "Клиент" });
  const ms = Date.now() - t0;
  console.log(`\n━━ ${s.id} · ${s.title ?? ""} · ${r.engine} · ${ms} мс`);
  for (const line of r.transcript) {
    if (line.from === "client") console.log(`👤 ${line.text}`);
    else {
      console.log(`🤖 ${line.text || "(молчит)"}`);
      const tr = line.trace;
      if (tr) {
        const calls = tr.route?.calls?.map((x) => `${x.why}:${x.model}`).join(", ") ?? "";
        const notes = tr.notes.map((n) => n.code + ("detail" in n && n.detail ? `(${String(n.detail).slice(0, 80)})` : "")).join(", ");
        console.log(`   ↳ ${tr.model ? `${tr.model.action}/${tr.model.stage}/${tr.model.handoff}/${tr.model.lang}` : "—"} · итог ${tr.result.phase}${tr.result.handoff ? `→${tr.result.handoff}` : ""} · ${calls}${notes ? ` · заметки: ${notes}` : ""}${tr.error ? ` · ошибка: ${tr.error}` : ""}`);
        if (Object.keys(tr.fields).length) console.log(`   ↳ поля: ${JSON.stringify(tr.fields)}`);
      }
    }
  }
  console.log(`   язык ${r.lang} · ${r.done ? "закончен" : "идёт"}${r.intents.length ? ` · заметка: ${r.intents[0]}` : ""}`);
  results.push({ id: s.id, title: s.title, ms, ...r, resume: undefined });
}

if (out) writeFileSync(out, JSON.stringify(results, null, 2));
await pool.end();
process.exit(0);
