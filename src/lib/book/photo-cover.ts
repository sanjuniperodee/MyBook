/**
 * Обложки на настоящих снимках. Шаблон — данные: снимок, точка фокуса, подложка, затемнение, плашка
 * и рамка. Из них строится такой же SVG в миллиметрах развёртки, как у рисованных обложек, поэтому
 * превью на сайте, 3D-книга и файл для типографии получаются из одного кода.
 *
 * Снимок кадрируется относительно лицевой крышки с загибами, а не всей развёртки: превью лица
 * совпадает с печатью при любой толщине корешка. Дальше снимок уходит на корешок и оборот,
 * а где кончается — продолжается своим зеркальным отражением (шва не видно) или подложкой.
 */
import type { CoverGeometry, Rect } from "./formats";
import { formats, print } from "./formats";
import type { ArtContext, CoverMood, CoverTemplate, CoverTextStyle } from "./covers";
import { n } from "./cover-kit";
import type { FontKey } from "./fonts";

export interface CoverPhoto {
  /** Встроенный снимок — имя файла в assets/cover-photos (без .jpg); загруженный в CRM — ключ хранилища designs/…. */
  key: string;
  width: number;
  height: number;
  /** Автор и источник снимка. */
  credit?: string;
}

export interface PhotoShade {
  kind: "top" | "bottom" | "full" | "vignette";
  color: string;
  opacity: number;
  /** Для top/bottom — какую долю высоты лица занимает переход. */
  size?: number;
}

export interface PhotoPlate {
  shape: "rect" | "rounded" | "oval" | "arch";
  fill: string;
  opacity: number;
  /** Тонкая линия внутри плашки. */
  stroke?: string;
  /** Поля вокруг области текста — доля ширины лица. */
  pad: number;
  shadow?: boolean;
}

export interface PhotoFrame {
  color: string;
  /** Отступ от края крышки, мм. */
  inset: number;
  double?: boolean;
}

export interface PhotoLayout {
  photo: CoverPhoto;
  /** Точка снимка (доли ширины и высоты), которая встаёт в центр лицевой крышки. */
  focus: { x: number; y: number };
  /**
   * Масштаб относительно «впритык» (снимок ровно закрывает лицо с загибами). Больше 1 — крупнее;
   * меньше 1 — снимок меньше лица, вокруг подложка (для снимков на однотонном фоне), край растушёван.
   */
  zoom: number;
  /** Подложка: цвет фона снимка — виден, где снимок кончается, и на обороте при back = "color". */
  base: string;
  /** Корешок и оборот: продолжение снимка или подложка. */
  back: "photo" | "color";
  shade?: PhotoShade;
  plate?: PhotoPlate;
  frame?: PhotoFrame;
}

/** Шаблон на снимке как данные — так его хранит CRM и так описаны встроенные. */
export interface PhotoTemplateData {
  id: string;
  name: { ru: string; kk: string };
  mood: Exclude<CoverMood, "photo">;
  layout: PhotoLayout;
  textArea: Rect;
  justify: "center" | "start" | "end";
  title: CoverTextStyle;
  subtitle: CoverTextStyle;
  names: CoverTextStyle;
  ornament?: { kind: "line" | "heart" | "star" | "dots"; color: string };
  spine: { color: string; font: FontKey };
  back: { color: string; font: FontKey; mirror?: boolean; area?: Rect };
}

/** Ширина растушёвки края снимка, мм. */
const FEATHER = 14;
/** Нахлёст соседних копий снимка на обороте, мм. */
const OVERLAP = 0.3;

/** Где лежит снимок на холсте, мм. Кадр считается от лицевой крышки с загибами — одинаково для превью и печати. */
export function photoPlacement(layout: PhotoLayout, g: CoverGeometry): Rect {
  // Превью лица (без корешка) — это блок; крышка в печати шире на кант сверху, снизу и с края.
  // Кладём снимок на такую же крышку, чтобы масштаб и кадр совпали с печатью.
  const o = g.spine ? 0 : print.cover.boardOverhangMm;
  const f = { x: g.front.x, y: g.front.y - o, w: g.front.w + o, h: g.front.h + o * 2 };
  const wrap = print.cover.wrapMm;
  const ext = { x: f.x, y: f.y - wrap, w: f.w + wrap, h: f.h + wrap * 2 };
  const { width: pw, height: ph } = layout.photo;
  const s = Math.max(ext.w / pw, ext.h / ph) * Math.max(0.3, layout.zoom);
  const w = pw * s;
  const h = ph * s;
  let x = f.x + f.w / 2 - layout.focus.x * w;
  let y = f.y + f.h / 2 - layout.focus.y * h;
  // Если снимок закрывает лицо по стороне, не даём ему открыть подложку — сдвигаем к краю.
  if (w >= ext.w) x = Math.min(ext.x, Math.max(ext.x + ext.w - w, x));
  if (h >= ext.h) y = Math.min(ext.y, Math.max(ext.y + ext.h - h, y));
  return { x, y, w, h };
}

/** Прямоугольник плашки вокруг области текста, мм. */
export function plateRect(plate: PhotoPlate, textArea: Rect, front: Rect): Rect {
  const pad = plate.pad * front.w;
  return {
    x: front.x + textArea.x * front.w - pad,
    y: front.y + textArea.y * front.h - pad,
    w: textArea.w * front.w + pad * 2,
    h: textArea.h * front.h + pad * 2,
  };
}

function plateShape(shape: PhotoPlate["shape"], r: Rect, attrs: string): string {
  if (shape === "oval") return `<ellipse cx="${n(r.x + r.w / 2)}" cy="${n(r.y + r.h / 2)}" rx="${n(r.w / 2)}" ry="${n(r.h / 2)}" ${attrs}/>`;
  if (shape === "arch") {
    const rad = Math.min(r.w / 2, r.h);
    return `<path d="M${n(r.x)},${n(r.y + r.h)} L${n(r.x)},${n(r.y + rad)} A${n(rad)},${n(rad)} 0 0 1 ${n(r.x + r.w)},${n(r.y + rad)} L${n(r.x + r.w)},${n(r.y + r.h)}Z" ${attrs}/>`;
  }
  const rx = shape === "rounded" ? Math.min(r.w, r.h) * 0.07 : 0;
  return `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" rx="${n(rx)}" ${attrs}/>`;
}

const inset = (r: Rect, d: number): Rect => ({ x: r.x + d, y: r.y + d, w: r.w - d * 2, h: r.h - d * 2 });

/** Плашка и рамка — «оформление», которое на обороте повторяется вслед за композицией лица. */
function decor(data: Pick<PhotoTemplateData, "layout" | "textArea">, g: CoverGeometry, uid: string): string {
  const { plate, frame } = data.layout;
  const f = g.front;
  let out = "";
  if (plate) {
    const r = plateRect(plate, data.textArea, f);
    if (plate.shadow) {
      out += `<defs><filter id="${uid}ps" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.6"/></filter></defs>`;
      out += plateShape(plate.shape, { ...r, x: r.x + 0.4, y: r.y + 1 }, `fill="#000" fill-opacity="0.3" filter="url(#${uid}ps)"`);
    }
    out += plateShape(plate.shape, r, `fill="${plate.fill}" fill-opacity="${n(plate.opacity)}"`);
    if (plate.stroke) out += plateShape(plate.shape, inset(r, Math.min(2, r.w * 0.025)), `fill="none" stroke="${plate.stroke}" stroke-width="0.3"`);
  }
  if (frame) {
    const a = inset(f, frame.inset);
    out += `<rect x="${n(a.x)}" y="${n(a.y)}" width="${n(a.w)}" height="${n(a.h)}" fill="none" stroke="${frame.color}" stroke-width="0.4"/>`;
    if (frame.double) {
      const b = inset(a, 1.5);
      out += `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" fill="none" stroke="${frame.color}" stroke-width="0.2"/>`;
    }
  }
  return out;
}

function shadeLayer(shade: PhotoShade, g: CoverGeometry, uid: string): string {
  const f = g.front;
  const id = `${uid}sh`;
  const fill = (c: string, o: number) => `stop-color="${c}" stop-opacity="${n(o)}"`;
  if (shade.kind === "full") return `<rect width="${n(g.width)}" height="${n(g.height)}" fill="${shade.color}" fill-opacity="${n(shade.opacity)}"/>`;
  if (shade.kind === "vignette") {
    const r = Math.max(f.w, f.h) * 0.78;
    return `<defs><radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(f.x + f.w / 2)}" cy="${n(f.y + f.h / 2)}" r="${n(r)}"><stop offset="0.45" ${fill(shade.color, 0)}/><stop offset="1" ${fill(shade.color, shade.opacity)}/></radialGradient></defs><rect x="${n(f.x)}" y="0" width="${n(g.width - f.x)}" height="${n(g.height)}" fill="url(#${id})"/>`;
  }
  const size = (shade.size ?? 0.5) * f.h;
  const [y1, y2] = shade.kind === "top" ? [f.y + size, 0] : [f.y + f.h - size, g.height];
  return `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${n(y1)}" x2="0" y2="${n(y2)}"><stop offset="0" ${fill(shade.color, 0)}/><stop offset="1" ${fill(shade.color, shade.opacity)}/></linearGradient></defs><rect width="${n(g.width)}" height="${n(g.height)}" fill="url(#${id})"/>`;
}

/** Растушёвка краёв снимка, которые видны на холсте: градиент из цвета подложки внутрь снимка. */
function feather(p: Rect, g: CoverGeometry, base: string, uid: string, mirrored: boolean): string {
  let out = "";
  const left = mirrored ? 0 : p.x;
  const edges: [string, number, number, number, number, number, number, number, number][] = [];
  // [id, x, y, w, h, x1, y1, x2, y2] — градиент от непрозрачной подложки (1) к прозрачности (2)
  if (p.y > 0.01) edges.push(["t", 0, p.y, g.width, FEATHER, 0, p.y, 0, p.y + FEATHER]);
  if (p.y + p.h < g.height - 0.01) edges.push(["b", 0, p.y + p.h - FEATHER, g.width, FEATHER, 0, p.y + p.h, 0, p.y + p.h - FEATHER]);
  if (left > 0.01) edges.push(["l", left, 0, FEATHER, g.height, left, 0, left + FEATHER, 0]);
  if (p.x + p.w < g.width - 0.01) edges.push(["r", p.x + p.w - FEATHER, 0, FEATHER, g.height, p.x + p.w, 0, p.x + p.w - FEATHER, 0]);
  for (const [k, x, y, w, h, x1, y1, x2, y2] of edges) {
    const id = `${uid}f${k}`;
    out += `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}"><stop offset="0" stop-color="${base}"/><stop offset="1" stop-color="${base}" stop-opacity="0"/></linearGradient></defs><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="url(#${id})"/>`;
  }
  return out;
}

/** Адрес снимка шаблона для браузера (встроенный SVG на странице загружает его сам). */
export function coverPhotoUrl(key: string, width = 1600) {
  return `/api/cover-photos/${encodeURIComponent(key)}?w=${width}`;
}

export function photoArt(data: Pick<PhotoTemplateData, "layout" | "textArea">) {
  return (g: CoverGeometry, ctx: ArtContext): string => {
    const { layout } = data;
    const uid = ctx.uid;
    if (ctx.layer === "decor") return decor(data, g, uid);
    const p = photoPlacement(layout, g);
    const href = (ctx.imageHref ?? coverPhotoUrl(layout.photo.key)).replace(/&/g, "&amp;");
    // Слева от снимка — его копии через одну зеркальные: стыки совпадают, шва не видно.
    const copies = layout.back === "photo" && p.x > 0.01 ? Math.ceil(p.x / p.w) : 0;
    const mirrored = copies > 0;
    // Подложка «цвет»: снимок только на лице (с шарниром), корешок и оборот — подложкой.
    const clipX = layout.back === "color" && g.spine ? g.spine.x + g.spine.w : null;
    let out = `<rect width="${n(g.width)}" height="${n(g.height)}" fill="${layout.base}"/>`;
    out += `<defs><image id="${uid}im" href="${href}" width="${n(p.w)}" height="${n(p.h)}" preserveAspectRatio="none"/>`;
    if (clipX !== null) out += `<clipPath id="${uid}cl"><rect x="${n(clipX)}" y="0" width="${n(g.width - clipX)}" height="${n(g.height)}"/></clipPath>`;
    out += `</defs><g${clipX !== null ? ` clip-path="url(#${uid}cl)"` : ""}>`;
    out += `<use href="#${uid}im" x="${n(p.x)}" y="${n(p.y)}"/>`;
    for (let k = 1; k <= copies; k++) {
      // Копии заходят друг на друга на 0,3 мм — иначе сглаживание оставляет на стыке светлую нить.
      const lap = OVERLAP * k;
      const right = p.x - (k - 1) * p.w + lap;
      out += k % 2
        ? `<use href="#${uid}im" x="${n(p.x)}" y="${n(p.y)}" transform="translate(${n(right + p.x)} 0) scale(-1 1)"/>`
        : `<use href="#${uid}im" x="${n(p.x - k * p.w + lap)}" y="${n(p.y)}"/>`;
    }
    out += feather(p, g, layout.base, uid, mirrored);
    out += `</g>`;
    if (layout.shade) out += shadeLayer(layout.shade, g, uid);
    out += decor(data, g, uid);
    return out;
  };
}

/** Средний цвет снимка не знаем без файла — миниатюра в выборе до загрузки картинки окрашена подложкой. */
function swatch(layout: PhotoLayout) {
  return `linear-gradient(160deg, ${layout.base}, ${layout.base})`;
}

export function photoTemplate(data: PhotoTemplateData, extra: Partial<Pick<CoverTemplate, "rev" | "custom" | "hidden">> = {}): CoverTemplate {
  return {
    id: data.id,
    name: data.name,
    mood: data.mood,
    swatch: swatch(data.layout),
    photo: data.layout,
    art: photoArt(data),
    textArea: data.textArea,
    justify: data.justify,
    title: data.title,
    subtitle: data.subtitle,
    names: data.names,
    ornament: data.ornament,
    spine: data.spine,
    back: data.back,
    ...extra,
  };
}

/** Разрешение снимка в печати (dpi) на самом крупном формате при заданном масштабе: от 250 — хорошо, ниже 200 — заметно. */
export function photoDpi(layout: Pick<PhotoLayout, "photo" | "zoom">) {
  const wrap = print.cover.wrapMm;
  const o = print.cover.boardOverhangMm;
  let s = 0;
  for (const f of Object.values(formats)) {
    const w = f.widthMm + o + wrap;
    const h = f.heightMm + o * 2 + wrap * 2;
    s = Math.max(s, Math.max(w / layout.photo.width, h / layout.photo.height) * Math.max(0.3, layout.zoom));
  }
  return Math.round(25.4 / s);
}
