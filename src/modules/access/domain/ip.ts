/**
 * Список разрешённых IP для входа в CRM: отдельные адреса и подсети (CIDR), IPv4 и IPv6.
 * Чистый модуль — покрывается юнит-тестами.
 */
import { isIP } from "node:net";

export interface AllowRule {
  raw: string;
  version: 4 | 6;
  bits: bigint;
  prefix: number;
}

function ipv4ToBig(ip: string): bigint {
  return ip.split(".").reduce((acc, p) => (acc << 8n) | BigInt(Number(p)), 0n);
}

function ipv6ToBig(ip: string): bigint {
  let addr = ip;
  // IPv4 в хвосте (::ffff:1.2.3.4)
  const v4 = addr.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const n = ipv4ToBig(v4[1]);
    addr = addr.replace(v4[1], `${(n >> 16n).toString(16)}:${(n & 0xffffn).toString(16)}`);
  }
  const [head, tail] = addr.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined ? (tail ? tail.split(":") : []) : [];
  const groups = tail !== undefined ? [...h, ...Array(8 - h.length - t.length).fill("0"), ...t] : h;
  return groups.reduce((acc, g) => (acc << 16n) | BigInt(parseInt(g || "0", 16)), 0n);
}

/** Адрес клиента без мусора: IPv4, отображённый в IPv6 (::ffff:1.2.3.4), приводим к IPv4. */
export function normalizeIp(ip: string): string {
  const s = ip.trim().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  return mapped ? mapped[1] : s;
}

export function parseRule(line: string): AllowRule | null {
  const raw = line.replace(/#.*$/, "").trim();
  if (!raw) return null;
  const [addrRaw, prefixRaw] = raw.split("/");
  const addr = normalizeIp(addrRaw);
  const version = isIP(addr);
  if (version !== 4 && version !== 6) return null;
  const max = version === 4 ? 32 : 128;
  const prefix = prefixRaw === undefined ? max : Number(prefixRaw);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > max) return null;
  return { raw, version, bits: version === 4 ? ipv4ToBig(addr) : ipv6ToBig(addr), prefix };
}

/** Разбор текста из настроек: по одному правилу в строке (или через запятую); ошибочные строки — отдельно. */
export function parseAllowlist(text: string): { rules: AllowRule[]; invalid: string[] } {
  const rules: AllowRule[] = [];
  const invalid: string[] = [];
  for (const line of text.split(/[\n,]+/)) {
    const clean = line.replace(/#.*$/, "").trim();
    if (!clean) continue;
    const r = parseRule(clean);
    if (r) rules.push(r);
    else invalid.push(clean);
  }
  return { rules, invalid };
}

export function ipAllowed(ip: string, rules: AllowRule[]): boolean {
  if (!rules.length) return true;
  const addr = normalizeIp(ip);
  const version = isIP(addr);
  if (version !== 4 && version !== 6) return false;
  const value = version === 4 ? ipv4ToBig(addr) : ipv6ToBig(addr);
  const max = version === 4 ? 32 : 128;
  return rules.some((r) => {
    if (r.version !== version) return false;
    const shift = BigInt(max - r.prefix);
    return value >> shift === r.bits >> shift;
  });
}
