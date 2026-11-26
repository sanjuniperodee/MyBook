/**
 * Передача данных CRM между сайтом и mybook-api без потерь (ADR 0012, A5 — Раздел 5): JSON не знает Date, Map, Set,
 * BigInt, байтов, FormData и файлов, а страницы и server actions CRM работают с теми же значениями, что вернули сервисы
 * модулей (или прислала форма). encodeWire заменяет такие значения помеченными объектами `{ "~wire": вид, v }`,
 * decodeWire собирает их обратно. Чистые функции — без БД и Next.
 */

const TAG = "~wire";

type Tagged = { [TAG]: "date" | "map" | "set" | "bigint" | "bytes" | "undef" | "nan" | "obj" | "form" | "file"; v: unknown };

const isTagged = (v: unknown): v is Tagged => !!v && typeof v === "object" && !Array.isArray(v) && TAG in (v as object) && Object.keys(v as object).length === 2 && "v" in (v as object);

/** Значение → JSON-совместимое (Date, Map, Set, BigInt, Uint8Array, FormData, File помечены). */
export async function encodeWire(value: unknown): Promise<unknown> {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : { [TAG]: "nan", v: String(value) };
  if (typeof value === "bigint") return { [TAG]: "bigint", v: value.toString() };
  if (value instanceof Date) return { [TAG]: "date", v: Number.isNaN(value.getTime()) ? null : value.toISOString() };
  if (value instanceof Map) return { [TAG]: "map", v: await Promise.all([...value.entries()].map(async ([k, v]) => [await encodeWire(k), await encodeWire(v)])) };
  if (value instanceof Set) return { [TAG]: "set", v: await Promise.all([...value].map(encodeWire)) };
  if (value instanceof Uint8Array) return { [TAG]: "bytes", v: Buffer.from(value).toString("base64") };
  if (typeof Blob !== "undefined" && value instanceof Blob) {
    const name = typeof File !== "undefined" && value instanceof File ? value.name : null;
    return { [TAG]: "file", v: { name, type: value.type, data: Buffer.from(await value.arrayBuffer()).toString("base64") } };
  }
  if (typeof FormData !== "undefined" && value instanceof FormData) {
    return { [TAG]: "form", v: await Promise.all([...value.entries()].map(async ([k, v]) => [k, await encodeWire(v)])) };
  }
  // undefined внутри массива JSON превратил бы в null.
  if (Array.isArray(value)) return Promise.all(value.map((x) => (x === undefined ? { [TAG]: "undef", v: null } : encodeWire(x))));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined || typeof v === "function") continue;
      out[k] = await encodeWire(v);
    }
    // Объект, случайно похожий на метку, заворачиваем, чтобы decodeWire не принял его за неё.
    return isTagged(out) ? { [TAG]: "obj", v: out } : out;
  }
  return undefined;
}

/** Обратное к encodeWire. */
export function decodeWire<T = unknown>(value: unknown): T {
  return decode(value) as T;
}

function decode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decode);
  if (!value || typeof value !== "object") return value;
  if (isTagged(value)) {
    const v = value.v;
    switch (value[TAG]) {
      case "date":
        return new Date(typeof v === "string" ? v : Number.NaN);
      case "map":
        return new Map((v as [unknown, unknown][]).map(([k, x]) => [decode(k), decode(x)]));
      case "set":
        return new Set((v as unknown[]).map(decode));
      case "bigint":
        return BigInt(v as string);
      case "bytes":
        return new Uint8Array(Buffer.from(v as string, "base64"));
      case "undef":
        return undefined;
      case "nan":
        return Number(v);
      case "file": {
        const f = v as { name: string | null; type: string; data: string };
        const bytes = Buffer.from(f.data, "base64");
        return f.name === null ? new Blob([bytes], { type: f.type }) : new File([bytes], f.name, { type: f.type });
      }
      case "form": {
        const form = new FormData();
        for (const [k, x] of v as [string, unknown][]) {
          const item = decode(x);
          if (item instanceof Blob) form.append(k, item);
          else form.append(k, String(item));
        }
        return form;
      }
      case "obj": {
        const out: Record<string, unknown> = {};
        for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = decode(x);
        return out;
      }
    }
  }
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(value as Record<string, unknown>)) out[k] = decode(x);
  return out;
}
