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
import { coverLayouts, newLayerId, parseCoverDesign, safeArea, type CoverDesign, type CoverLayer, type CoverTexts } from "../cover-design";
import type { BookFormat } from "../formats";
import { getInteriorDesign, isInteriorId, parseInteriorStyle, PAPER, applyInteriorStyle, type InteriorId, type InteriorStyle } from "../interiors";
import { contrastRatio } from "./critic";

export type DesignTarget = "pages" | "cover";

export const DESIGN_OPS = ["set", "unset", "set_interior", "set_template", "apply_layout", "add_layer", "remove_layer", "move_layer"] as const;
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

const opsSchema = designAiSchema.properties.ops;

/** Режим «варианты»: три цельных направления, у каждого — название, идея и операции. */
export const variantsSchema = {
  type: "object",
  properties: {
    reply: { type: "string", description: "Одна фраза клиенту: что за три варианта." },
    variants: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, idea: { type: "string" }, ops: opsSchema },
        required: ["name", "idea", "ops"],
        additionalProperties: false,
      },
    },
  },
  required: ["reply", "variants"],
  additionalProperties: false,
} as const;

/** Режим «оценка»: балл, вывод, сильные стороны и советы с операциями. */
export const reviewSchema = {
  type: "object",
  properties: {
    score: { type: "integer", description: "1–10" },
    summary: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    tips: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, why: { type: "string" }, ops: opsSchema },
        required: ["title", "why", "ops"],
        additionalProperties: false,
      },
    },
  },
  required: ["score", "summary", "strengths", "tips"],
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
  if (contrastRatio(design.palette.ink, design.paper ?? PAPER) < 4.5) errors.push(`цвет текста ${design.palette.ink} плохо читается на бумаге ${design.paper ?? PAPER} — нужен контраст не меньше 4.5`);
  return { state: { interior, style }, errors };
}

// ─── обложка ───────────────────────────────────────────────────────────────

const BINDS = new Set(["title", "subtitle", "names"]);
const LAYER_KINDS = new Set(["text", "image", "shape", "decor"]);

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

/** Для готовых макетов: тексты книги и её фото (макет раскладывает их сам). */
export interface CoverLayoutContext {
  texts: CoverTexts;
  photos: { id: string; width: number; height: number }[];
}

/**
 * Операции над обложкой из слоёв: фон, свойства слоёв, новые слои, удаление и порядок, смена шаблона-фона, готовый
 * макет целиком (apply_layout — дальше операции правят уже его слои). Новому слою без id или с занятым id даётся свой.
 */
export function applyCoverOps(state: CoverState, ops: readonly DesignOp[], format: BookFormat, layoutCtx?: CoverLayoutContext): { state: CoverState; errors: string[] } {
  const errors: string[] = [];
  let template = state.template;
  const draft = clone(state.design) as unknown as Obj & { layers: Obj[] };
  const wanted: { path: string; id: string | null; keys: string[]; value: unknown }[] = [];
  const added: string[] = [];
  // Текст книги находится и по привязке: в готовых макетах у названия свой id, а модель пишет layers.title.
  const find = (id: string) => {
    const i = draft.layers.findIndex((l) => l.id === id);
    return i >= 0 || !BINDS.has(id) ? i : draft.layers.findIndex((l) => l.kind === "text" && l.bind === id);
  };
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
      case "apply_layout": {
        const id = typeof v.value === "string" ? v.value : o.path;
        const layout = coverLayouts.find((l) => l.id === id);
        if (!layout) {
          errors.push(`apply_layout: нет макета «${id}»`);
          break;
        }
        const built = layout.build({ texts: layoutCtx?.texts ?? { title: "", subtitle: "", names: "" }, format, photos: layoutCtx?.photos ?? [] }) as unknown as Obj & { layers: Obj[] };
        for (const k of Object.keys(draft)) delete draft[k];
        Object.assign(draft, clone(built));
        if (layout.template) template = layout.template;
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
        } else if (keys[0] === "layers" && keys.length >= 3 && keys[1].startsWith("@")) {
          // Группа слоёв одного вида: layers.@decor.color — все украшения сразу.
          const kind = keys[1].slice(1);
          const group = draft.layers.filter((l) => l.kind === kind);
          if (!LAYER_KINDS.has(kind)) errors.push(`${o.op} ${o.path}: группа — @text, @image, @shape или @decor`);
          else if (!group.length) errors.push(`${o.op} ${o.path}: на обложке нет слоёв вида ${kind}`);
          else if (keys[2] === "id" || keys[2] === "kind") errors.push(`${o.op} ${o.path}: id и вид слоя менять нельзя`);
          else
            for (const l of group) {
              setIn(l, keys.slice(2), value);
              if (o.op === "set") wanted.push({ path: o.path, id: l.id as string, keys: keys.slice(2), value });
            }
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
          if (o.op === "set") wanted.push({ path: o.path, id: draft.layers[i].id as string, keys: keys.slice(2), value });
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

// ─── краткое описание — для контекста «другой стороны» книги ───────────────

/** Оформление страниц в двух строках: стиль, шрифты, бумага и акцент. */
export function describePages(state: PagesState): string {
  const d = applyInteriorStyle(getInteriorDesign(state.interior), state.style);
  return `стиль ${state.interior}; шрифты: заголовки ${d.display.font}, текст ${d.type.body}; бумага ${d.paper ?? PAPER}, текст ${d.palette.ink}, акцент ${d.palette.accent}, украшения ${d.palette.ornament}`;
}

/** Обложка в двух строках: фон, шрифт и цвет названия, что на ней есть. */
export function describeCover(state: CoverState): string {
  const bg = state.design.background;
  const fon = bg.kind === "color" ? `фон ${bg.color}` : bg.kind === "gradient" ? `фон-градиент ${bg.from}→${bg.to}` : `фон — рисунок шаблона ${state.template}`;
  const title = state.design.layers.find((l) => l.kind === "text" && l.bind === "title");
  const t = title?.kind === "text" ? `название шрифтом ${title.style.font} цвета ${title.style.color}` : "без названия";
  const kinds = [...new Set(state.design.layers.filter((l) => !l.hidden).map((l) => (l.kind === "decor" ? `декор ${l.motif}` : l.kind === "image" ? "фото" : l.kind === "shape" ? `фигура ${l.shape}` : "")))].filter(Boolean);
  return `${fon}; ${t}${kinds.length ? `; ещё: ${kinds.join(", ")}` : ""}`;
}

/** Обложка-шаблон без своих слоёв: id и настроение рисунка. */
export const describeTemplate = (id: string, mood: string) => `шаблон ${id} (${mood})`;

export type Rgb = [number, number, number];

/** Общий тон фото словами (для модели): яркость, теплота, насыщенность. */
export function photoTone(colors: Rgb[]): string {
  if (!colors.length) return "";
  const avg = colors.reduce((a, c) => [a[0] + c[0], a[1] + c[1], a[2] + c[2]] as Rgb, [0, 0, 0] as Rgb).map((v) => v / colors.length) as Rgb;
  const light = 0.2126 * avg[0] + 0.7152 * avg[1] + 0.0722 * avg[2];
  const warm = avg[0] - avg[2];
  const sat = Math.max(...avg) - Math.min(...avg);
  return [light > 170 ? "светлые" : light < 85 ? "тёмные" : "средние по яркости", warm > 18 ? "тёплые" : warm < -12 ? "холодные" : "нейтральные", sat < 25 ? "приглушённые" : "насыщенные"].join(", ");
}
