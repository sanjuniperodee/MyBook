import type { z } from "zod";

/**
 * Минимальное значение, которое проходит схему zod 4 (для заглушек в тестах паритета: ответ общего кода должен пройти
 * проверку контракта, иначе обе стороны отвечают 500 и сверять нечего). Необязательные поля опускаются, nullable —
 * null, массивы пустые, перечисления — первое значение, строки с форматом — валидный образец.
 */
export function sampleOf(schema: z.ZodType): unknown {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- внутреннее описание схем zod 4 (_zod.def) не типизировано наружу
  const def = (schema as any)._zod.def;
  switch (def.type) {
    case "object": {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(def.shape as Record<string, z.ZodType>)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- см. выше
        const t = (v as any)._zod.def.type;
        if (t === "optional") continue;
        out[k] = sampleOf(v);
      }
      return out;
    }
    case "string": {
      const fmt = (schema as unknown as { format?: string | null }).format ?? def.format;
      if (fmt === "uuid" || fmt === "guid") return "00000000-0000-4000-8000-000000000000";
      if (fmt === "email") return "a@example.kz";
      if (fmt === "url") return "https://example.kz/";
      if (fmt === "datetime") return "2026-11-25T08:00:00.000Z";
      if (fmt === "date") return "2026-11-25";
      return "x";
    }
    case "number":
    case "int":
    case "bigint":
      return 0;
    case "boolean":
      return false;
    case "null":
      return null;
    case "undefined":
    case "void":
      return undefined;
    case "date":
      return new Date("2026-11-25T08:00:00.000Z");
    case "literal":
      return def.values[0];
    case "enum":
      return Object.values(def.entries)[0];
    case "array":
      return [];
    case "tuple":
      return def.items.map((i: z.ZodType) => sampleOf(i));
    case "record":
    case "map":
      return {};
    case "nullable":
      return null;
    case "optional":
      return undefined;
    case "default":
    case "prefault":
      return typeof def.defaultValue === "function" ? def.defaultValue() : def.defaultValue;
    case "union":
      return sampleOf(def.options[0]);
    case "intersection":
      return { ...(sampleOf(def.left) as object), ...(sampleOf(def.right) as object) };
    case "pipe":
      return sampleOf(def.in);
    case "readonly":
    case "catch":
    case "nonoptional":
    case "lazy":
      return sampleOf(def.innerType ?? def.getter());
    case "any":
    case "unknown":
      return null;
    default:
      throw new Error(`sampleOf: тип схемы ${def.type} не поддержан`);
  }
}
