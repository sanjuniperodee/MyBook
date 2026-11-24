import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { admin } from "@/i18n/admin";
import { iosDevices } from "@/modules/workspace";
import { fileExists, getFile, putFile } from "@/shared/infrastructure/storage";
import { safeEqual } from "@/shared/crypto";

/**
 * iPhone-версия приложения CRM без App Store и TestFlight (Ad Hoc): сборка подписана для зарегистрированных телефонов.
 * 1) Сотрудник в CRM ставит профиль регистрации — телефон сам присылает UDID (Profile Service, POST на /api/ios-app/udid).
 * 2) На Mac `scripts/mobile/ios-adhoc.sh` регистрирует новые телефоны в Apple, собирает и выкладывает сборку (publish).
 * 3) Телефон, вошедший в сборку, ставит приложение по ссылке itms-services (манифест и IPA — по подписанной ссылке:
 *    установщик iOS ходит без cookie).
 */

export const IOS_IPA_KEY = "mobile/ios/app.ipa";
export const IOS_BUILD_KEY = "mobile/ios/build.json";

export interface IosBuild {
  version: string;
  build: string;
  bundleId: string;
  /** UDID телефонов из профиля Ad Hoc этой сборки — только им приложение откроется. */
  udids: string[];
  builtAt: string;
}

// ─── подписанные ссылки (без сессии: профиль, установщик iOS) ────────────────────────────────────────────────────────

const key = () => createHash("sha256").update(`ios-app:${process.env.APP_SECRET || `mybook:${process.env.DATABASE_URL ?? ""}`}`).digest();

/** Ссылка на userId с действием и сроком: регистрация телефона — сутки, установка — час. */
export function iosToken(userId: string, action: "enroll" | "install", ttlSec: number, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, a: action, x: Math.floor(now / 1000) + ttlSec })).toString("base64url");
  return `${payload}.${createHmac("sha256", key()).update(payload).digest("base64url")}`;
}

export function readIosToken(token: string | null, action: "enroll" | "install", now = Date.now()): string | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEqual(sig, createHmac("sha256", key()).update(payload).digest("base64url"))) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString()) as { u?: string; a?: string; x?: number };
    if (p.a !== action || typeof p.u !== "string" || typeof p.x !== "number" || p.x * 1000 < now) return null;
    return p.u;
  } catch {
    return null;
  }
}

// ─── профиль регистрации телефона ─────────────────────────────────────────────────────────────────────────────────

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Профиль «Profile Service»: iOS после установки шлёт на URL подписанный plist с UDID, моделью и версией и открывает
 * страницу, куда мы его перенаправим. Сам профиль ничего на телефоне не меняет и после ответа не остаётся.
 */
export function enrollProfile(origin: string, token: string): string {
  const url = `${origin}/api/ios-app/udid?t=${encodeURIComponent(token)}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <dict>
    <key>URL</key><string>${xml(url)}</string>
    <key>DeviceAttributes</key>
    <array><string>UDID</string><string>PRODUCT</string><string>VERSION</string></array>
  </dict>
  <key>PayloadOrganization</key><string>MyBooks CRM</string>
  <key>PayloadDisplayName</key><string>${xml(admin.iosProfileName)}</string>
  <key>PayloadDescription</key><string>${xml(admin.iosProfileDescription)}</string>
  <key>PayloadIdentifier</key><string>kz.mybooks.crm.enroll</string>
  <key>PayloadUUID</key><string>${randomUUID().toUpperCase()}</string>
  <key>PayloadType</key><string>Profile Service</string>
  <key>PayloadVersion</key><integer>1</integer>
</dict>
</plist>`;
}

/** Ответ телефона — plist внутри подписи PKCS#7: достаём текст plist и нужные ключи. */
export function parseDeviceAttributes(body: Buffer): { udid: string; product: string; version: string } | null {
  const text = body.toString("latin1");
  const start = text.indexOf("<?xml");
  const end = text.indexOf("</plist>");
  if (start < 0 || end < 0) return null;
  const plist = Buffer.from(text.slice(start, end + 8), "latin1").toString("utf8");
  const get = (k: string) => plist.match(new RegExp(`<key>${k}</key>\\s*<string>([^<]*)</string>`))?.[1]?.trim() ?? "";
  const udid = get("UDID");
  // UDID iPhone: 40 hex (старые) или 8-16 с дефисом (с iPhone XS).
  if (!/^([0-9a-f]{40}|[0-9A-F]{8}-[0-9A-F]{16})$/i.test(udid)) return null;
  return { udid, product: get("PRODUCT").slice(0, 40), version: get("VERSION").slice(0, 20) };
}

export const saveIosDevice = (userId: string, d: { udid: string; product: string; version: string }) => iosDevices.save(userId, d);

// ─── сборка ───────────────────────────────────────────────────────────────────────────────────────────────────────

export async function iosBuild(): Promise<IosBuild | null> {
  if (!(await fileExists(IOS_BUILD_KEY)) || !(await fileExists(IOS_IPA_KEY))) return null;
  try {
    return JSON.parse((await getFile(IOS_BUILD_KEY)).toString()) as IosBuild;
  } catch {
    return null;
  }
}

export const readIosIpa = () => getFile(IOS_IPA_KEY);

export async function publishIosBuild(ipa: Uint8Array, build: IosBuild) {
  await putFile(IOS_IPA_KEY, ipa);
  await putFile(IOS_BUILD_KEY, JSON.stringify(build));
}

/** Телефоны сотрудника и вошли ли они в текущую сборку. */
export async function iosStatus(userId: string) {
  const [devices, build] = await Promise.all([iosDevices.ofUser(userId), iosBuild()]);
  const inBuild = new Set((build?.udids ?? []).map((u) => u.toLowerCase()));
  return {
    build: build ? { version: build.version, build: build.build, builtAt: build.builtAt } : null,
    devices: devices.map((d) => ({ id: d.id, product: d.product, iosVersion: d.iosVersion, createdAt: d.createdAt.toISOString(), ready: inBuild.has(d.udid.toLowerCase()) })),
  };
}

/**
 * Все зарегистрированные телефоны — для сборки на Mac. Имя в кабинете Apple нейтральное («WD-1a2b3c iPhone15,2»): без
 * имени сотрудника и компании (аккаунт разработчика — чужой); кто есть кто — в CRM (crm_ios_devices).
 */
export async function allIosDevices() {
  const rows = await iosDevices.all();
  return rows.map((r) => ({ udid: r.udid, name: deviceLabel(r.udid, r.product) }));
}

export const deviceLabel = (udid: string, product: string) => `WD-${udid.replace(/-/g, "").slice(-6).toLowerCase()} ${product || "iPhone"}`.trim();

/** Манифест установки по воздуху: адрес IPA, идентификатор и версия. */
export function installManifest(ipaUrl: string, b: IosBuild) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>items</key>
  <array>
    <dict>
      <key>assets</key>
      <array><dict><key>kind</key><string>software-package</string><key>url</key><string>${xml(ipaUrl)}</string></dict></array>
      <key>metadata</key>
      <dict>
        <key>bundle-identifier</key><string>${xml(b.bundleId)}</string>
        <key>bundle-version</key><string>${xml(b.version)}</string>
        <key>kind</key><string>software</string>
        <key>title</key><string>MyBooks CRM</string>
      </dict>
    </dict>
  </array>
</dict>
</plist>`;
}
