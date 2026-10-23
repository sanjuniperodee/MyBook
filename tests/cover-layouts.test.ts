import { describe, expect, it } from "vitest";
import { boardSize, COVER_LIMITS, coverLayouts, parseCoverDesign, rawLayouts, safeArea, type CoverLayer, type LayoutGenre } from "@/lib/book/cover-design";
import { isKnownCover } from "@/lib/book/covers";
import { formats } from "@/lib/book/formats";
import { messagesFor } from "@/i18n/messages";

const texts = { title: "Там, где ты — там мой дом", subtitle: "История нашей любви", names: "Элия & Олжас" };
const photos = Array.from({ length: 5 }, (_, i) => ({ id: `0b6f0b0e-1111-4a4a-8b8b-12345678900${i}`, width: 1600, height: 1200 }));
const GENRES: LayoutGenre[] = ["romance", "family", "kids", "biography", "gift", "photo", "fiction", "premium", "minimal", "bigphoto", "collage", "art"];

/** Всё, что задано в макете, разбор сохранил с точностью до округления (числа — до 1e-3); умолчания разбора не в счёт. */
function close(a: unknown, b: unknown, path = ""): string | null {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= 1e-3 ? null : `${path}: ${a} ≠ ${b}`;
  if (a && b && typeof a === "object" && typeof b === "object") {
    if (Array.isArray(a) && (a as unknown[]).length !== (b as unknown[]).length) return `${path}: length`;
    for (const k of Object.keys(a)) {
      if ((a as Record<string, unknown>)[k] === undefined) continue;
      const r = close((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
      if (r) return r;
    }
    return null;
  }
  return a === b ? null : `${path}: ${String(a)} ≠ ${String(b)}`;
}

/** Описывающий прямоугольник слоя с учётом поворота, доли крышки. */
function bounds(l: CoverLayer, W: number, H: number) {
  const a = ((l.rotate ?? 0) * Math.PI) / 180;
  const w = l.w * W;
  const h = l.h * H;
  const bw = Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a));
  const bh = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a));
  const cx = (l.x + l.w / 2) * W;
  const cy = (l.y + l.h / 2) * H;
  return { x0: (cx - bw / 2) / W, x1: (cx + bw / 2) / W, y0: (cy - bh / 2) / H, y1: (cy + bh / 2) / H };
}

describe("библиотека макетов обложек", () => {
  it("каждый жанр есть, id макетов разные, названия на обоих языках", () => {
    expect(new Set(coverLayouts.map((l) => l.genre))).toEqual(new Set(GENRES));
    expect(new Set(coverLayouts.map((l) => l.id)).size).toBe(coverLayouts.length);
    for (const loc of ["ru", "kk"] as const) for (const l of coverLayouts) expect(messagesFor(loc).design.layouts.items[l.id]?.name, `${loc} ${l.id}`).toBeTruthy();
  });

  for (const l of coverLayouts)
    it(`${l.id}: строится в A5 и квадрате, без фото и с фото, данные проходят проверку без изменений`, () => {
      if (l.template) expect(isKnownCover(l.template)).toBe(true);
      for (const format of [formats.a5, formats.square])
        for (const ph of [[], photos]) {
          // Как написан — разбор ничего не обрезает и не отбрасывает (только округляет).
          const raw = rawLayouts.find((r) => r.id === l.id)!.build({ texts, format, photos: ph });
          expect(raw.layers.length).toBeLessThanOrEqual(COVER_LIMITS.layers);
          expect(close(raw, parseCoverDesign(raw)), `${l.id} ${format.id} ${ph.length}`).toBeNull();
          const d = l.build({ texts, format, photos: ph });
          expect(parseCoverDesign(d)).toEqual(d);
          expect(new Set(d.layers.map((x) => x.id)).size).toBe(d.layers.length);
          // Фото книги — в слоях по порядку; снимок коллекции — про запас у каждого места.
          for (const x of d.layers) if (x.kind === "image") expect(x.stock).toBeTruthy();
          if (ph.length) expect(d.layers.some((x) => x.kind === "image" && x.photoId) || !d.layers.some((x) => x.kind === "image")).toBe(true);
          // Текст книги — в безопасной зоне (с поворотом), слои не дальше края листа развёртки.
          const { w: W, h: H } = boardSize(format);
          const safe = safeArea(format);
          for (const x of d.layers) {
            const b = bounds(x, W, H);
            if (x.kind === "text" && x.bind) {
              expect(b.x0, `${l.id} ${format.id} ${x.id}`).toBeGreaterThanOrEqual(safe.x - 1e-3);
              expect(b.x1, `${l.id} ${format.id} ${x.id}`).toBeLessThanOrEqual(safe.x + safe.w + 1e-3);
              expect(b.y0, `${l.id} ${format.id} ${x.id}`).toBeGreaterThanOrEqual(safe.y - 1e-3);
              expect(b.y1, `${l.id} ${format.id} ${x.id}`).toBeLessThanOrEqual(safe.y + safe.h + 1e-3);
            }
            expect(b.y1, `${l.id} ${format.id} ${x.id}`).toBeLessThanOrEqual(1.061);
          }
          expect(d.layers.some((x) => x.kind === "text" && x.bind === "title")).toBe(true);
        }
    });
});
