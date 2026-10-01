/**
 * Одноразовые коды для двухфакторного входа (TOTP, RFC 6238) — совместимы с Google Authenticator,
 * 1Password, Яндекс Ключом и т. п. Чистый модуль на node:crypto, без сети и базы.
 */
import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error("Некорректный ключ");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Новый секрет: 20 случайных байт (160 бит, как рекомендует RFC 4226) в base32. */
export const generateSecret = () => base32Encode(randomBytes(20));

/** HOTP (RFC 4226): код для счётчика. */
export function hotp(key: Buffer, counter: number, digits = 6, algo: "sha1" | "sha256" | "sha512" = "sha1"): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac(algo, key).update(msg).digest();
  const offset = h[h.length - 1] & 0x0f;
  const bin = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export const STEP_SEC = 30;

export function totp(secret: string, at = Date.now(), digits = 6): string {
  return hotp(base32Decode(secret), Math.floor(at / 1000 / STEP_SEC), digits);
}

/**
 * Проверка кода с допуском ±1 шаг (часы телефона могут спешить). Возвращает номер шага, чтобы
 * вызывающий мог запретить повторное использование того же кода.
 */
export function verifyTotp(secret: string, code: string, at = Date.now(), window = 1): number | null {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const key = base32Decode(secret);
  const step = Math.floor(at / 1000 / STEP_SEC);
  for (let d = -window; d <= window; d++) if (hotp(key, step + d) === c) return step + d;
  return null;
}

/** Ссылка для QR-кода в приложении-аутентификаторе. */
export function otpauthUrl(secret: string, account: string, issuer = "MyBooks CRM") {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SEC}`;
}

/** «1234-5678»: 10 резервных кодов на случай потери телефона. */
export function generateBackupCodes(n = 10): string[] {
  return Array.from({ length: n }, () => `${randomInt(0, 10_000).toString().padStart(4, "0")}-${randomInt(0, 10_000).toString().padStart(4, "0")}`);
}

export const hashBackupCode = (code: string) => createHash("sha256").update(`mb-backup:${code.replace(/\D/g, "")}`).digest("hex");

/** Похоже на резервный код (8 цифр, с дефисом или без), а не на код из приложения. */
export const isBackupCodeShape = (code: string) => /^\d{4}-?\d{4}$/.test(code.trim());
