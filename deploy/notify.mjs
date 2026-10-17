// Итог деплоя — в группу WhatsApp («MyBooks») от номера, подключённого к своему шлюзу GOWA («Интеграции» → WhatsApp).
// Запуск из deploy/deploy.sh: node --env-file=.env deploy/notify.mjs ok <sha> <prev-sha> <релиз> | fail <sha>
// Нужны GOWA_API_URL и GOWA_BASIC_AUTH в .env; группа — DEPLOY_NOTIFY_GROUP (по умолчанию «MyBooks», точное название).
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [status, sha = "", prevSha = "", release = ""] = process.argv.slice(2);
const api = (process.env.GOWA_API_URL || "").replace(/\/+$/, "");
const auth = process.env.GOWA_BASIC_AUTH || "";
const groupName = process.env.DEPLOY_NOTIFY_GROUP || "MyBooks";
// DEPLOY_NOTIFY_DRY=1 — только показать текст (проверка без отправки).
if (!api && !process.env.DEPLOY_NOTIFY_DRY) process.exit(0);

const headers = { "Content-Type": "application/json", ...(auth ? { Authorization: `Basic ${Buffer.from(auth).toString("base64")}` } : {}) };
const gowa = async (method, path, body) => {
  const res = await fetch(`${api}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
};

const git = (...args) => {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

/** Что вошло в релиз: заголовки коммитов от прошлого релиза (без слияний), не больше 15. */
function changes() {
  if (!sha) return [];
  const range = prevSha && prevSha !== sha ? `${prevSha}..${sha}` : `${sha}~1..${sha}`;
  if (prevSha === sha) return ["повторная выкатка той же версии"];
  return git("log", "--no-merges", "--format=%s", range)
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 15)
    .map((s) => (s.length > 300 ? `${s.slice(0, 297)}…` : s));
}

function text() {
  if (status !== "ok") return `⚠️ Деплой MyBooks (${sha}) не прошёл — сайт работает на прежней версии. Подробности: ~/mybook-deploy*.log на сервере.`;
  const list = changes();
  return [`✅ Деплой MyBooks завершён — ${release || sha}`, "", list.length ? "Что нового:" : "", ...list.map((s) => `• ${s}`)].filter((l, i) => l || i === 1).join("\n").slice(0, 3500);
}

if (process.env.DEPLOY_NOTIFY_DRY) {
  console.log(text());
  process.exit(0);
}

try {
  const groups = await gowa("GET", "/user/my/groups");
  const list = Array.isArray(groups?.results) ? groups.results : (groups?.results?.data ?? []);
  const group = list.find((g) => (g.Name ?? g.name ?? "").trim() === groupName);
  if (!group) throw new Error(`группа «${groupName}» не найдена у номера шлюза`);
  await gowa("POST", "/send/message", { phone: group.JID ?? group.jid, message: text() });
  console.log(`уведомление отправлено в «${groupName}»`);
} catch (err) {
  console.error(`уведомление о деплое не отправлено: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
