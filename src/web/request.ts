import "server-only";
import { headers } from "next/headers";

/** IP клиента для показа (страница «Вход запрещён»): X-Real-IP от nginx, иначе последний адрес X-Forwarded-For. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  const chain = h.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  return chain.at(-1) || "local";
}
