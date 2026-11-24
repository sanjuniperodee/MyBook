import "server-only";
import { execFile } from "node:child_process";
import { createPrivateKey, sign } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { admin } from "@/i18n/admin";
import { notify } from "@/modules/workspace";
import { allIosDevices, iosBuild, publishIosBuild, readIosIpa } from "@/server/ios-app";

/**
 * Автоподпись iPhone-версии на сервере: сотрудник зарегистрировал телефон — сервер сам вносит его в Apple (App Store
 * Connect API), пересоздаёт профиль Ad Hoc со всеми телефонами и переподписывает уже собранное приложение (zsign — без
 * сборки, секунды). Новый код приложения по-прежнему собирается на Mac (scripts/mobile/ios-adhoc.sh), а выкладка вызывает
 * ту же переподпись. Ключи — в ~/secrets/ios на сервере (переменные IOS_*). Не заданы — ничего не делаем, работает скрипт.
 */

export interface IosSignConfig {
  keyId: string;
  issuerId: string;
  ascKey: string;
  signKeyFile: string;
  signCertFile: string;
  certId: string;
  bundleId: string;
  zsign: string;
}

export function iosSignConfig(env: Record<string, string | undefined> = process.env): IosSignConfig | null {
  const v = (k: string) => env[k]?.trim() ?? "";
  const cfg = { keyId: v("IOS_ASC_KEY_ID"), issuerId: v("IOS_ASC_ISSUER_ID"), ascKeyFile: v("IOS_ASC_KEY_FILE"), signKeyFile: v("IOS_SIGN_KEY_FILE"), signCertFile: v("IOS_SIGN_CERT_FILE"), certId: v("IOS_SIGN_CERT_ID"), bundleId: v("IOS_BUNDLE_ID"), zsign: v("IOS_ZSIGN") || "zsign" };
  if (Object.values(cfg).some((x) => !x)) return null;
  return { ...cfg, ascKey: cfg.ascKeyFile };
}

/** Имя нашего профиля в кабинете Apple: при каждом новом телефоне он пересоздаётся (профиль Apple не дополняется). */
export const PROFILE_NAME = "Workdesk Ad Hoc";

const b64 = (x: string | Buffer) => Buffer.from(x).toString("base64url");

export function ascJwt(cfg: Pick<IosSignConfig, "keyId" | "issuerId">, privateKeyPem: string, nowSec = Math.floor(Date.now() / 1000)) {
  const head = b64(JSON.stringify({ alg: "ES256", kid: cfg.keyId, typ: "JWT" }));
  const claims = b64(JSON.stringify({ iss: cfg.issuerId, iat: nowSec, exp: nowSec + 900, aud: "appstoreconnect-v1" }));
  const sig = sign("sha256", Buffer.from(`${head}.${claims}`), { key: createPrivateKey(privateKeyPem), dsaEncoding: "ieee-p1363" });
  return `${head}.${claims}.${b64(sig)}`;
}

type Fetch = typeof fetch;
interface Asc {
  (method: string, path: string, body?: unknown): Promise<{ data: unknown } & Record<string, unknown>>;
}

function ascClient(cfg: IosSignConfig, keyPem: string, fetcher: Fetch): Asc {
  return async (method, path, body) => {
    const res = await fetcher(`https://api.appstoreconnect.apple.com${path}`, {
      method,
      headers: { Authorization: `Bearer ${ascJwt(cfg, keyPem)}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 204) return { data: null };
    const data = (await res.json().catch(() => ({}))) as { data: unknown; errors?: unknown };
    if (!res.ok) throw new Error(`ASC ${method} ${path.split("?")[0]}: ${res.status} ${JSON.stringify(data.errors ?? data).slice(0, 300)}`);
    return data;
  };
}

type Row = { id: string; attributes: Record<string, string> };

/** Телефоны → в Apple (уже известные пропускаются), затем новый профиль Ad Hoc со всеми включёнными iPhone команды. */
export async function provisionDevices(asc: Asc, cfg: IosSignConfig, phones: { udid: string; name: string }[]) {
  const listed = ((await asc("GET", "/v1/devices?limit=200&filter[platform]=IOS&fields[devices]=udid,status")).data as Row[]) ?? [];
  const known = new Map(listed.map((d) => [d.attributes.udid.toLowerCase(), d]));
  for (const p of phones) {
    const d = known.get(p.udid.toLowerCase());
    if (!d) {
      const r = (await asc("POST", "/v1/devices", { data: { type: "devices", attributes: { udid: p.udid, name: p.name.slice(0, 50), platform: "IOS" } } })).data as Row;
      known.set(p.udid.toLowerCase(), { id: r.id, attributes: { udid: p.udid, status: "ENABLED" } });
    }
  }
  const devices = [...known.values()].filter((d) => d.attributes.status !== "DISABLED");
  const bundle = ((await asc("GET", `/v1/bundleIds?filter[identifier]=${encodeURIComponent(cfg.bundleId)}`)).data as Row[]).find((b) => b.attributes.identifier === cfg.bundleId);
  if (!bundle) throw new Error(`bundle id ${cfg.bundleId} not registered`);
  const old = ((await asc("GET", `/v1/profiles?filter[name]=${encodeURIComponent(PROFILE_NAME)}`)).data as Row[]) ?? [];
  for (const p of old) await asc("DELETE", `/v1/profiles/${p.id}`);
  const created = (await asc("POST", "/v1/profiles", {
    data: {
      type: "profiles",
      attributes: { name: PROFILE_NAME, profileType: "IOS_APP_ADHOC" },
      relationships: {
        bundleId: { data: { type: "bundleIds", id: bundle.id } },
        certificates: { data: [{ type: "certificates", id: cfg.certId }] },
        devices: { data: devices.map((d) => ({ type: "devices", id: d.id })) },
      },
    },
  })).data as Row;
  return { profile: Buffer.from(created.attributes.profileContent, "base64"), udids: devices.map((d) => d.attributes.udid) };
}

const run = promisify(execFile);
let queue: Promise<unknown> = Promise.resolve();

/**
 * Переподписать выложенную сборку под все зарегистрированные телефоны. Если все они уже в сборке — ничего не делаем.
 * Вызовы идут по очереди (два сотрудника в одну минуту — две подписи подряд, вторая обычно пропускается).
 * Возвращает id сотрудников, чьи телефоны только что вошли в сборку.
 */
export function resignIosBuild(opts: { force?: boolean; fetcher?: Fetch } = {}): Promise<string[]> {
  const job = queue.then(() => resignNow(opts));
  queue = job.catch(() => undefined);
  return job;
}

async function resignNow({ force = false, fetcher = fetch }: { force?: boolean; fetcher?: Fetch }): Promise<string[]> {
  const cfg = iosSignConfig();
  const build = await iosBuild();
  if (!cfg || !build) return [];
  const phones = await allIosDevices();
  const inBuild = new Set(build.udids.map((u) => u.toLowerCase()));
  const fresh = phones.filter((p) => !inBuild.has(p.udid.toLowerCase()));
  if (!fresh.length && !force) return [];
  const asc = ascClient(cfg, await readFile(cfg.ascKey, "utf8"), fetcher);
  const { profile, udids } = await provisionDevices(asc, cfg, phones);
  const dir = await mkdtemp(join(tmpdir(), "ios-sign-"));
  try {
    await writeFile(join(dir, "in.ipa"), await readIosIpa());
    await writeFile(join(dir, "adhoc.mobileprovision"), profile);
    await run(cfg.zsign, ["-q", "-k", cfg.signKeyFile, "-c", cfg.signCertFile, "-m", join(dir, "adhoc.mobileprovision"), "-z", "6", "-o", join(dir, "out.ipa"), join(dir, "in.ipa")], { timeout: 180_000, maxBuffer: 4 * 1024 * 1024 }).catch((err: { stderr?: string; stdout?: string; message: string }) => {
      throw new Error(`zsign: ${(err.stderr || err.stdout || err.message).trim().slice(-500)}`);
    });
    await publishIosBuild(await readFile(join(dir, "out.ipa")), { ...build, udids, builtAt: new Date().toISOString() });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  const ready = new Set(udids.map((u) => u.toLowerCase()));
  return [...new Set(fresh.filter((p) => ready.has(p.udid.toLowerCase())).map((p) => p.userId))];
}

/** После регистрации телефона: подписать и сказать сотруднику, что можно ставить. Ошибка — в журнал (сборка на Mac — запасной путь). */
export async function resignAfterEnroll() {
  try {
    const users = await resignIosBuild();
    if (users.length) await notify(users, { kind: "system", title: admin.iosReadyTitle, body: admin.iosReadyBody, link: "/admin/app" });
  } catch (err) {
    console.error("[ios-sign]", err instanceof Error ? err.message : err);
  }
}
