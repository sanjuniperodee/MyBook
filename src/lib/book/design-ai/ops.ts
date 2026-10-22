/**
 * Правки дизайна от ИИ — операции «путь → значение». Модель (Claude Haiku) не пересобирает дизайн целиком, а называет,
 * что поменять: так меньше выходных токенов, она не теряет слои и настройки, которые не просили трогать, а каждую
 * правку можно проверить. Значение — JSON-литерал строкой ("\"literata\"", "11.5", "{\"font\":\"prata\"}"): схема
 * ответа остаётся строгой (все поля обязательны), а форма значения проверяется уже здесь.
 *
 * После операций результат проходит те же проверки, что и сохранение из редактора (parseInteriorStyle,
 * parseCoverDesign): в книгу попадает только допустимое. Что разбор отбросил или поправил — возвращается как замечание,
 * по нему модель исправляет ответ (harness.ts).
 */
import { isKnownCover } from "../covers";
import { newLayerId, parseCoverDesign, safeArea, type CoverDesign, type CoverLayer } from "../cover-design";
import type { BookFormat } from "../formats";
import { getInteriorDesign, isInteriorId, luminance, parseInteriorStyle, PAPER, applyInteriorStyle, type InteriorId, type InteriorStyle } from "../interiors";

export type DesignTarget = "pages" | "cover";

export const DESIGN_OPS = ["set", "unset", "set_interior", "set_template", "add_layer", "remove_layer", "move_layer"] as const;
export type DesignOpKind = (typeof DESIGN_OPS)[number];

export interface DesignOp {
  op: DesignOpKind;
  /** Путь через точку: «fonts.body», «colors.accent», «layers.title.style.size»; у операций со слоем — id слоя. */
  path: string;
  /** JSON-литерал строкой; у unset и remove_layer — пусто. */
  value: string;
}

/** Строгая схема ответа модели (output_config.format): короткий ответ клиенту и операции. */
export const designAiSchema = {
  type: "object",
  properties: {
    reply: { type: "string", description: "Одна-две фразы клиенту: что изменено. На языке клиента." },
    ops: {
      type: "array",
      items: {
        type: "object",
        properties: {
          op: { type: "string", enum: [...DESIGN_OPS] },
          path: { type: "string" },
          value: { type: "string", description: "JSON-литерал строкой: \"\\\"literata\\\"\", \"11.5\", \"true\", \"{...}\"; у unset и remove_layer — пустая строка" },
        },
        required: ["op", "path", "value"],
        additionalProperties: false,
      },
    },
  },
  required: ["reply", "ops"],
  additionalProperties: false,
} as const;

/** Сколько операций за раз — больше не нужно ни одной разумной просьбе. */
export const MAX_OPS = 60;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const clone = <T>(v: T): T => structuredClone(v);

/** Значение операции: JSON, а строка без кавычек (модель забыла их) — как есть. */
export function opValue(raw: string): { ok: true; value: unknown } | { ok: false } {
  const s = raw.trim();
  if (!s) return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch {
    return /^[\p{L}\p{N}#_-]+$/u.test(s) ? { ok: true, value: s } : { ok: false };
  }
}

const segments = (path: string) => path.split(".").map((s) => s.trim()).filter(Boolean);

function setIn(target: Obj, keys: string[], value: unknown) {
  let cur: Obj = target;
  for (const k of keys.slice(0, -1)) {
    if (!isObj(cur[k])) cur[k] = {};
    cur = cur[k] as Obj;
  }
  const last = keys.at(-1)!;
  if (value === undefined) delete cur[last];
  else cur[last] = value;
}

function getIn(target: unknown, keys: string[]): unknown {
  let cur = target;
  for (const k of keys) {
    if (!isObj(cur)) return undefined;
    cur = cur[k];
  }
  return cur;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ─── страницы ──────────────────────────────────────────────────────────────

export interface PagesState {
  interior: InteriorId;
  style: InteriorStyle;
}

const PAGE_ROOTS = new Set(["fonts", "body", "heading", "display", "label", "colors", "elements", "chapters"]);

/** Контраст двух цветов по WCAG. */
function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/**
 * Операции над оформлением страниц. Смена стиля (set_interior) сбрасывает свои настройки, кроме оформления глав, —
 * как в студии: настройки подбирались к прежнему стилю. Замечания — что не применилось и почему.
 */
export function applyPagesOps(state: PagesState, ops: readonly DesignOp[]): { state: PagesState; errors: string[] } {
  const errors: string[] = [];
  let interior = state.interior;
  let draft: Obj = clone(state.style) as Obj;
  const wanted: { path: string; keys: string[]; value: unknown }[] = [];
  for (const o of ops.slice(0, MAX_OPS)) {
    const v = opValue(o.value);
    if (!v.ok) {
      errors.push(`${o.op} ${o.path}: значение не JSON — ${o.value.slice(0, 80)}`);
      continue;
    }
    if (o.op === "set_interior") {
      const id = typeof v.value === "string" ? v.value : o.path;
      if (!isInteriorId(id)) {
        errors.push(`set_interior: нет стиля «${id}»`);
        continue;
      }
      interior = id;
      draft = isObj(draft.chapters) ? { chapters: draft.chapters } : {};
      continue;
    }
    if (o.op !== "set" && o.op !== "unset") {
      errors.push(`${o.op}: для страниц есть только set, unset и set_interior`);
      continue;
    }
    const keys = segments(o.path);
    if (!keys.length || !PAGE_ROOTS.has(keys[0])) {
      errors.push(`${o.op} ${o.path}: неизвестный путь (начало — ${[...PAGE_ROOTS].join(", ")})`);
      continue;
    }
    setIn(draft, keys, o.op === "unset" ? undefined : v.value);
    if (o.op === "set") wanted.push({ path: o.path, keys, value: v.value });
  }
  const style = parseInteriorStyle(draft);
  for (const w of wanted) {
    const got = getIn(style, w.keys);
    if (got === undefined && w.value !== null) errors.push(`set ${w.path}: значение ${JSON.stringify(w.value).slice(0, 80)} недопустимо — не применено`);
    else if (typeof w.value === "number" && typeof got === "number" && Math.abs(got - w.value) > 1e-6) errors.push(`set ${w.path}: ${w.value} вне допустимого — поставлено ${got}`);
  }
  // Читаемость: текст на бумаге.
  const design = applyInteriorStyle(getInteriorDesign(interior), style);
  if (contrast(design.palette.ink, design.paper ?? PAPER) < 4.5) errors.push(`цвет текста ${design.palette.ink} плохо читается на бумаге ${design.paper ?? PAPER} — нужен контраст не меньше 4.5`);
  return { state: { interior, style }, errors };
}

// ─── обложка ───────────────────────────────────────────────────────────────

export interface CoverState {
  template: string;
  design: CoverDesign;
}

/** Текстовые слои за безопасной зоной — их срежет край крышки или канавка у корешка. */
function outsideSafe(design: CoverDesign, format: BookFormat): string[] {
  const s = safeArea(format);
  return design.layers
    .filter((l) => l.kind === "text" && !l.hidden && !l.rotate)
    .filter((l) => l.x < s.x - 1e-3 || l.y < s.y - 1e-3 || l.x + l.w > s.x + s.w + 1e-3 || l.y + l.h > s.y + s.h + 1e-3)
    .map((l) => l.id);
}

/**
 * Операции над обложкой из слоёв: фон, свойства слоёв, новые слои, удаление и порядок, смена шаблона-фона.
 * Новому слою без id или с занятым id даётся свой.
 */
export function applyCoverOps(state: CoverState, ops: readonly DesignOp[], format: BookFormat): { state: CoverState; errors: string[] } {
  const errors: string[] = [];
  let template = state.template;
  const draft = clone(state.design) as unknown as Obj & { layers: Obj[] };
  const wanted: { path: string; id: string | null; keys: string[]; value: unknown }[] = [];
  const added: string[] = [];
  const find = (id: string) => draft.layers.findIndex((l) => l.id === id);
  for (const o of ops.slice(0, MAX_OPS)) {
    const v = opValue(o.value);
    if (!v.ok) {
      errors.push(`${o.op} ${o.path}: значение не JSON — ${o.value.slice(0, 80)}`);
      continue;
    }
    switch (o.op) {
      case "set_template": {
        const id = typeof v.value === "string" ? v.value : o.path;
        if (!isKnownCover(id)) errors.push(`set_template: нет шаблона «${id}»`);
        else template = id;
        break;
      }
      case "add_layer": {
        if (!isObj(v.value)) {
          errors.push("add_layer: значение — объект слоя");
          break;
        }
        const layer = { ...v.value } as Obj;
        if (typeof layer.id !== "string" || find(layer.id) >= 0) layer.id = newLayerId(draft as unknown as CoverDesign);
        if (o.path === "back") draft.layers.unshift(layer);
        else draft.layers.push(layer);
        added.push(layer.id as string);
        break;
      }
      case "remove_layer": {
        const i = find(o.path);
        if (i < 0) errors.push(`remove_layer: нет слоя «${o.path}»`);
        else draft.layers.splice(i, 1);
        break;
      }
      case "move_layer": {
        const i = find(o.path);
        const to = v.value;
        if (i < 0) {
          errors.push(`move_layer: нет слоя «${o.path}»`);
          break;
        }
        const [l] = draft.layers.splice(i, 1);
        const at = to === "front" ? draft.layers.length : to === "back" ? 0 : to === "up" ? Math.min(draft.layers.length, i + 1) : to === "down" ? Math.max(0, i - 1) : -1;
        if (at < 0) {
          draft.layers.splice(i, 0, l);
          errors.push(`move_layer ${o.path}: куда — front, back, up или down`);
        } else draft.layers.splice(at, 0, l);
        break;
      }
      case "set":
      case "unset": {
        const keys = segments(o.path);
        const value = o.op === "unset" ? undefined : v.value;
        if (keys[0] === "background") {
          setIn(draft, keys, value);
          if (o.op === "set") wanted.push({ path: o.path, id: null, keys, value });
        } else if (keys[0] === "layers" && keys.length >= 3) {
          const i = find(keys[1]);
          if (i < 0) {
            errors.push(`${o.op} ${o.path}: нет слоя «${keys[1]}»`);
            break;
          }
          if (keys[2] === "id" || keys[2] === "kind") {
            errors.push(`${o.op} ${o.path}: id и вид слоя менять нельзя — удалите слой и добавьте новый`);
            break;
          }
          setIn(draft.layers[i], keys.slice(2), value);
          if (o.op === "set") wanted.push({ path: o.path, id: keys[1], keys: keys.slice(2), value });
        } else errors.push(`${o.op} ${o.path}: неизвестный путь (background… или layers.<id>.…)`);
        break;
      }
      case "set_interior":
        errors.push("set_interior: это для страниц, у обложки — set_template");
        break;
    }
  }
  const design = parseCoverDesign(draft) ?? state.design;
  for (const id of added) if (!design.layers.some((l) => l.id === id)) errors.push(`add_layer: слой «${id}» отклонён — проверьте kind и поля`);
  for (const w of wanted) {
    const owner: unknown = w.id === null ? design : design.layers.find((l: CoverLayer) => l.id === w.id);
    const got = getIn(owner, w.id === null ? w.keys : w.keys);
    if (got === undefined && w.value !== null && w.value !== false) errors.push(`set ${w.path}: значение ${JSON.stringify(w.value).slice(0, 80)} недопустимо — не применено`);
    else if (typeof w.value === "number" && typeof got === "number" && Math.abs(got - w.value) > 1e-6) errors.push(`set ${w.path}: ${w.value} вне допустимого — поставлено ${got}`);
    else if (typeof w.value === "string" && typeof got === "string" && got.toUpperCase() !== w.value.toUpperCase()) errors.push(`set ${w.path}: «${w.value}» недопустимо — осталось «${got}»`);
  }
  const unsafe = outsideSafe(design, format);
  if (unsafe.length) errors.push(`текст слоёв ${unsafe.join(", ")} выходит за безопасную зону x ${safeArea(format).x.toFixed(3)}–${(safeArea(format).x + safeArea(format).w).toFixed(3)}, y ${safeArea(format).y.toFixed(3)}–${(safeArea(format).y + safeArea(format).h).toFixed(3)}`);
  return { state: { template, design }, errors };
}

/** Поменяло ли что-нибудь (для ответа «ничего не изменено»). */
export const changed = (a: unknown, b: unknown) => !same(a, b);
