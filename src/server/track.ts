import "server-only";
import { cookies } from "next/headers";

/** Cookie с событиями для счётчиков: сервер кладёт, браузер отправляет в Метрику/GA/Pixel и очищает. */
export const EVENTS_COOKIE = "mb_ev";

export type TrackEvent = { name: string; value?: number };

/** Ставит событие в очередь — его отправит компонент Analytics на следующей странице. */
export async function queueEvent(name: string, value?: number) {
  const jar = await cookies();
  let list: TrackEvent[] = [];
  try {
    list = JSON.parse(jar.get(EVENTS_COOKIE)?.value ?? "[]");
  } catch {}
  list.push(value === undefined ? { name } : { name, value });
  jar.set(EVENTS_COOKIE, JSON.stringify(list.slice(-5)), { maxAge: 600, sameSite: "lax", path: "/" });
}

/** Источник первого визита из cookie, записанной proxy. */
export async function readSource(): Promise<Record<string, string> | null> {
  try {
    const raw = (await cookies()).get("mb_src")?.value;
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === "string").slice(0, 10)) as Record<string, string> : null;
  } catch {
    return null;
  }
}
