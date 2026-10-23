import "server-only";
import sharp from "sharp";
import { getFile } from "@/shared/infrastructure/storage";
import { photoTone, type Rgb } from "@/lib/book/design-ai";

/**
 * Цвета фото книги для ИИ-дизайнера: несколько основных цветов и общий тон (светлое/тёмное, тёплое/холодное). Считаются
 * по превью (сжатому до 32×32) и запоминаются по id фото — снимок после загрузки не меняется.
 */
export interface PhotoPalette {
  colors: string[];
  tone: string;
}

const cache = new Map<string, Rgb[]>();
const CACHE_MAX = 2000;

const hex = ([r, g, b]: Rgb) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`.toUpperCase();

/** Основные цвета снимка: пиксели по корзинам 4×4×4 бита, самые людные корзины — их средний цвет. */
async function colorsOf(key: string): Promise<Rgb[]> {
  const { data } = await sharp(await getFile(key)).resize(32, 32, { fit: "cover" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const buckets = new Map<number, { n: number; sum: Rgb }>();
  for (let i = 0; i + 2 < data.length; i += 3) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const k = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const e = buckets.get(k) ?? { n: 0, sum: [0, 0, 0] as Rgb };
    e.n++;
    e.sum = [e.sum[0] + r, e.sum[1] + g, e.sum[2] + b];
    buckets.set(k, e);
  }
  return [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 4)
    .map((e) => e.sum.map((v) => v / e.n) as Rgb);
}

/** Палитра по первым фото книги (обложечное — первым); сбой чтения фото не мешает дизайнеру. */
export async function photoPalette(photos: { id: string; thumbKey: string }[], limit = 4): Promise<PhotoPalette | null> {
  const picked = photos.slice(0, limit);
  if (!picked.length) return null;
  const all: Rgb[] = [];
  for (const p of picked) {
    let c = cache.get(p.id);
    if (!c) {
      c = await colorsOf(p.thumbKey).catch(() => []);
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
      cache.set(p.id, c);
    }
    all.push(...c.slice(0, 2));
  }
  if (!all.length) return null;
  // Близкие цвета (расстояние меньше 40) — один.
  const distinct: Rgb[] = [];
  for (const c of all) if (!distinct.some((d) => Math.hypot(d[0] - c[0], d[1] - c[1], d[2] - c[2]) < 40)) distinct.push(c);
  return { colors: distinct.slice(0, 5).map(hex), tone: photoTone(all) };
}
