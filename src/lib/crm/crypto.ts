import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Ключ шифрования секретов интеграций: из APP_SECRET, иначе — стабильный ключ от строки подключения к БД. */
function masterKey() {
  const base = process.env.APP_SECRET || `mybook:${process.env.DATABASE_URL ?? ""}`;
  return createHash("sha256").update(`crm-settings:${base}`).digest();
}

/** AES-256-GCM: v1.<iv>.<tag>.<данные> в base64url. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", masterKey(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptSecret(value: string): string | null {
  const [v, iv, tag, data] = value.split(".");
  if (v !== "v1" || !iv || !tag || data === undefined) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null; // сменился APP_SECRET — секрет нужно ввести заново
  }
}

export function randomToken(bytes = 24) {
  return randomBytes(bytes).toString("base64url");
}

/** Сравнение строк за постоянное время (токены вебхуков, подписи). */
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const hmacSha1Base64 = (secret: string, data: string) => createHmac("sha1", secret).update(data).digest("base64");

function signKey() {
  const base = process.env.APP_SECRET || `mybook:${process.env.DATABASE_URL ?? ""}`;
  return createHash("sha256").update(`crm-sign:${base}`).digest();
}

/** Подписанное значение «данные.подпись» (HMAC-SHA256) — для коротко живущих cookie. */
export function signValue(data: string): string {
  return `${data}.${createHmac("sha256", signKey()).update(data).digest("base64url")}`;
}

export function verifySigned(value: string): string | null {
  const i = value.lastIndexOf(".");
  if (i <= 0) return null;
  const data = value.slice(0, i);
  return safeEqual(signValue(data), value) ? data : null;
}
