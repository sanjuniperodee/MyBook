// Клиент App Store Connect API для раздачи iPhone-версии (Ad Hoc): ключ и команда — из ~/.appstoreconnect/mybooks-ios.env
// (в репозитории секретов нет). Команды:
//   node scripts/mobile/asc.mjs setup                 — идентификатор приложения с push (один раз)
//   node scripts/mobile/asc.mjs devices               — телефоны команды (JSON)
//   node scripts/mobile/asc.mjs register <файл.json>  — зарегистрировать телефоны [{udid, name}] (уже известные пропускаются)
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const env = Object.fromEntries(
  readFileSync(`${homedir()}/.appstoreconnect/mybooks-ios.env`, "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const b64 = (x) => Buffer.from(x).toString("base64url");

function token() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: "ES256", kid: env.ASC_KEY_ID, typ: "JWT" }));
  const claims = b64(JSON.stringify({ iss: env.ASC_ISSUER_ID, iat: now, exp: now + 900, aud: "appstoreconnect-v1" }));
  const sig = sign("sha256", Buffer.from(`${head}.${claims}`), { key: createPrivateKey(readFileSync(env.ASC_KEY_PATH, "utf8")), dsaEncoding: "ieee-p1363" });
  return `${head}.${claims}.${b64(sig)}`;
}

async function asc(method, path, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, { method, headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(data.errors ?? data).slice(0, 400)}`);
  return data;
}

async function setup() {
  const found = await asc("GET", `/v1/bundleIds?filter[identifier]=${encodeURIComponent(env.IOS_BUNDLE_ID)}`);
  let id = found.data.find((b) => b.attributes.identifier === env.IOS_BUNDLE_ID)?.id;
  if (!id) {
    id = (await asc("POST", "/v1/bundleIds", { data: { type: "bundleIds", attributes: { identifier: env.IOS_BUNDLE_ID, name: env.IOS_BUNDLE_NAME, platform: "IOS" } } })).data.id;
    console.log("идентификатор создан:", env.IOS_BUNDLE_ID);
  } else console.log("идентификатор уже есть:", env.IOS_BUNDLE_ID);
  const caps = await asc("GET", `/v1/bundleIds/${id}/bundleIdCapabilities`);
  if (!caps.data.some((c) => c.attributes.capabilityType === "PUSH_NOTIFICATIONS")) {
    await asc("POST", "/v1/bundleIdCapabilities", { data: { type: "bundleIdCapabilities", attributes: { capabilityType: "PUSH_NOTIFICATIONS" }, relationships: { bundleId: { data: { type: "bundleIds", id } } } } });
    console.log("push включён");
  } else console.log("push уже включён");
}

async function devices() {
  const r = await asc("GET", "/v1/devices?limit=200&fields[devices]=udid,name,status,deviceClass");
  return r.data.map((d) => ({ udid: d.attributes.udid, name: d.attributes.name, status: d.attributes.status, class: d.attributes.deviceClass }));
}

async function register(file) {
  const want = JSON.parse(readFileSync(file, "utf8"));
  const known = new Set((await devices()).map((d) => d.udid.toLowerCase()));
  const added = [];
  for (const d of want) {
    if (known.has(d.udid.toLowerCase())) continue;
    await asc("POST", "/v1/devices", { data: { type: "devices", attributes: { udid: d.udid, name: (d.name || "iPhone").slice(0, 50), platform: "IOS" } } });
    added.push(d.udid);
  }
  console.log(JSON.stringify({ added }));
}

/** Сертификат Apple Distribution по CSR (закрытый ключ остаётся там, где создан CSR — на сервере). Печатает id и PEM. */
async function cert(csrPath) {
  const csr = readFileSync(csrPath, "utf8").replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const r = await asc("POST", "/v1/certificates", { data: { type: "certificates", attributes: { certificateType: "DISTRIBUTION", csrContent: csr } } });
  const pem = `-----BEGIN CERTIFICATE-----\n${r.data.attributes.certificateContent.match(/.{1,64}/g).join("\n")}\n-----END CERTIFICATE-----\n`;
  console.log(JSON.stringify({ id: r.data.id, expires: r.data.attributes.expirationDate, pem }));
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "setup") await setup();
else if (cmd === "devices") console.log(JSON.stringify(await devices()));
else if (cmd === "register") await register(arg);
else if (cmd === "cert") await cert(arg);
else console.log("setup | devices | register <файл>");
