import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * IP клиента от фронта на Vercel (ADR 0013): nginx бэкенда видит адрес Vercel, поэтому фронт передаёт адрес клиента
 * заголовками, подписанными общим секретом EDGE_IP_SECRET. Без секрета или с неверной/старой подписью бэкенд заголовкам
 * не верит — лимиты по IP и правило «вход в CRM только из своей сети» считаются по адресу соединения, как раньше.
 */
export const CLIENT_IP_HEADER = "x-mb-client-ip";
export const CLIENT_IP_SIG_HEADER = "x-mb-client-ip-sig";
const MAX_AGE_MS = 5 * 60_000;

const mac = (secret: string, ip: string, ts: string) => createHmac("sha256", secret).update(`${ip}.${ts}`).digest("base64url");

/** Подпись «<время>.<hmac>» для адреса клиента. */
export function signClientIp(ip: string, secret: string, now = Date.now()): string {
  const ts = String(now);
  return `${ts}.${mac(secret, ip, ts)}`;
}

/** Подпись верна и свежая (±5 минут). */
export function verifyClientIp(ip: string, sig: string | null | undefined, secret: string | null | undefined, now = Date.now()): boolean {
  if (!secret || !sig || !ip || ip.length > 64) return false;
  const dot = sig.indexOf(".");
  if (dot <= 0) return false;
  const ts = sig.slice(0, dot);
  const at = Number(ts);
  if (!Number.isFinite(at) || Math.abs(now - at) > MAX_AGE_MS) return false;
  const want = Buffer.from(mac(secret, ip, ts));
  const got = Buffer.from(sig.slice(dot + 1));
  return want.length === got.length && timingSafeEqual(want, got);
}

/**
 * Адрес клиента — для лимитов частоты, списка разрешённых IP и журнала. Подписанный адрес от фронта (выше), иначе
 * X-Real-IP своего прокси, иначе последний адрес X-Forwarded-For (первый клиент может подставить сам — его добавил
 * ближайший к приложению прокси). Одно правило для mybook-api и бэкенда на Nest (ADR 0014).
 */
export function clientIpFrom(header: (name: string) => string | null | undefined, secret: string | null | undefined): string {
  const forwarded = header(CLIENT_IP_HEADER)?.trim();
  if (forwarded && verifyClientIp(forwarded, header(CLIENT_IP_SIG_HEADER), secret)) return forwarded;
  const real = header("x-real-ip")?.trim();
  if (real) return real;
  const chain = header("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  return chain.at(-1) || "local";
}
