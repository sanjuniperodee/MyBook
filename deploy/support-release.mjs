// Обращения по выкатке: коммиты релиза (от прошлого релиза до этого) уходят сайту, и обращения из «Обращение №N» в
// тексте коммита закрываются, а человеку из обращения уходит уведомление в WhatsApp (src/app/api/support/release).
// Запуск из deploy/deploy.sh после удачной выкатки: node --env-file=.env deploy/support-release.mjs <sha> <prev-sha> <релиз> <порт>
// SUPPORT_RELEASE_DRY=1 — только показать, что ушло бы (без запроса).
import { createHash, createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [sha = "", prevSha = "", release = "", port = process.env.MYBOOK_PORT || "3040"] = process.argv.slice(2);
if (!sha || sha === prevSha) process.exit(0);

const git = (...args) => {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  } catch {
    return "";
  }
};

// Без прошлого релиза (первая выкатка, откат) — только сам коммит: старые коммиты не должны закрывать обращения заново.
const range = prevSha ? `${prevSha}..${sha}` : `${sha}~1..${sha}`;
const commits = git("log", "--no-merges", "--format=%H%x1f%s%x1f%b%x1e", range)
  .split("\x1e")
  .map((rec) => rec.trim())
  .filter(Boolean)
  .map((rec) => {
    const [hash, subject = "", body = ""] = rec.split("\x1f");
    return { sha: hash.trim(), subject: subject.trim().slice(0, 1000), body: body.trim().slice(0, 10_000) };
  })
  .filter((c) => /^[0-9a-f]{40}$/.test(c.sha) && /обращени|support|ticket/i.test(`${c.subject}\n${c.body}`))
  .slice(0, 500);

if (!commits.length) process.exit(0);
if (process.env.SUPPORT_RELEASE_DRY) {
  console.log(JSON.stringify({ release, commits }, null, 2));
  process.exit(0);
}

// Та же формула, что releaseToken() в src/server/support-release.ts.
const base = process.env.APP_SECRET || `mybook:${process.env.DATABASE_URL ?? ""}`;
const token = createHmac("sha256", createHash("sha256").update(`support-release:${base}`).digest()).update("support-release").digest("hex");
const body = JSON.stringify({ release, commits });

// Next слушает localhost: на одних машинах это ::1, на других 127.0.0.1 — пробуем оба.
let lastError = "";
for (const host of ["[::1]", "127.0.0.1"]) {
  try {
    const res = await fetch(`http://${host}:${port}/api/support/release`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Release-Token": token },
      body,
      signal: AbortSignal.timeout(90_000),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${JSON.stringify(json)}`);
    const list = json?.tickets ?? [];
    if (!list.length) console.log("обращения: в коммитах есть упоминания, но открытых обращений с такими номерами нет");
    for (const t of list) console.log(`обращение №${t.number}: ${t.closed ? "закрыто" : "уже было закрыто"}${t.notified ? ", уведомление отправлено" : t.closed ? ", уведомление не ушло" : ""}`);
    process.exit(0);
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    // Пробуем второй адрес, только если до первого не достучались: после таймаута или ответа с ошибкой сайт мог уже
    // закрыть обращения и написать людям — повтор отправил бы уведомления второй раз.
    const refused = err instanceof TypeError && /ECONNREFUSED|EADDRNOTAVAIL|ENETUNREACH|fetch failed/i.test(`${err.message} ${err.cause?.code ?? ""}`);
    if (!refused) break;
  }
}
console.log(`⚠ обращения не обновились: ${lastError}`);
