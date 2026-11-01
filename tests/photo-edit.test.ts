import { describe, expect, it } from "vitest";
import { Book, Photo, type PhotoEditRecord, type PhotoEditRepository, type PhotoProps, type PhotoRepository } from "@/modules/authoring/domain";
import { PhotosService } from "@/modules/authoring/application/services";
import type { ImageProcessor } from "@/modules/authoring/application/ports";
import { applyColor, autoLevels, effectiveAdjust } from "@/lib/photo-edit/color";
import { coverScale, emptyEdit, flipEdit, isEmptyEdit, MAX_DRAW_POINTS, outputSize, parsePhotoEdit, photoVersion, rotateEditCCW, rotateEditCW, type PhotoEdit, type TextLayer } from "@/lib/photo-edit/doc";
import { FakeUow, ids, MemBooks, MemFiles, noQuestions, owner, rejectsWith, startBook } from "./doubles/authoring";

/**
 * Редактор фото: описание правки (повороты, отражение, проверка на сервере), свет и цвет над пикселями и сервис —
 * сохранение готовой картинки с оригиналом, «Вернуть оригинал», поворот и удаление правленого фото.
 */

const text = (over: Partial<TextLayer> = {}): TextLayer => ({
  id: "t1",
  type: "text",
  text: "Лето 1998",
  font: "onest",
  weight: 600,
  italic: false,
  color: "#FFFFFF",
  align: "center",
  lineHeight: 1.15,
  spacing: 0,
  background: null,
  backgroundOpacity: 0.9,
  stroke: null,
  strokeWidth: 0.08,
  shadow: "soft",
  x: 0.2,
  y: 0.7,
  rotation: 10,
  scale: 1,
  opacity: 1,
  ...over,
});

const withCrop = (): PhotoEdit => ({ ...emptyEdit(), geometry: { turns: 0, flip: false, straighten: 5, crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 }, aspect: "4:3" }, layers: [text()] });

describe("описание правки", () => {
  it("поворот на четверть: кадр, слои и пропорция поворачиваются вместе со снимком, четыре поворота — как было", () => {
    const e = rotateEditCW(withCrop());
    expect(e.geometry.turns).toBe(1);
    expect(e.geometry.crop).toEqual({ x: 0.2, y: 0.1, w: 0.6, h: 0.5 });
    expect(e.geometry.aspect).toBe("3:4");
    expect(e.layers[0]).toMatchObject({ x: 0.3, y: 0.2, rotation: 100 });
    expect(rotateEditCW(rotateEditCW(rotateEditCW(e)))).toEqual(withCrop());
    expect(rotateEditCCW(rotateEditCW(withCrop()))).toEqual(withCrop());
  });

  it("размер готовой картинки после поворота — стороны меняются местами", () => {
    const e = withCrop();
    const a = outputSize(4000, 3000, e.geometry);
    const b = outputSize(4000, 3000, rotateEditCW(e).geometry);
    expect([b.w, b.h]).toEqual([a.h, a.w]);
  });

  it("отражение зеркалит видимое: дважды — как было, при нечётных поворотах снимок доворачивается на пол-оборота", () => {
    const e = withCrop();
    const f = flipEdit(e);
    expect(f.geometry).toMatchObject({ flip: true, straighten: -5, crop: { x: 0.4, y: 0.2, w: 0.5, h: 0.6 } });
    expect(f.layers[0]).toMatchObject({ x: 0.8, rotation: -10 });
    expect(flipEdit(f)).toEqual(e);
    expect(flipEdit(rotateEditCW(e)).geometry.turns).toBe(3);
  });

  it("выпрямление приближает снимок ровно настолько, чтобы не было пустых углов", () => {
    expect(coverScale(300, 200, 0)).toBe(1);
    const s = coverScale(300, 200, 10);
    const a = (10 * Math.PI) / 180;
    // Углы рамки 300×200, повёрнутые на −10°, лежат внутри снимка, увеличенного в s раз.
    for (const [x, y] of [[150, 100], [-150, 100]]) {
      const rx = x * Math.cos(a) + y * Math.sin(a);
      const ry = -x * Math.sin(a) + y * Math.cos(a);
      expect(Math.abs(rx)).toBeLessThanOrEqual(150 * s + 1e-6);
      expect(Math.abs(ry)).toBeLessThanOrEqual(100 * s + 1e-6);
    }
  });

  it("пустая правка — это оригинал", () => {
    expect(isEmptyEdit(emptyEdit())).toBe(true);
    expect(isEmptyEdit({ ...emptyEdit(), adjust: { brightness: 0 } })).toBe(true);
    expect(isEmptyEdit({ ...emptyEdit(), adjust: { brightness: 5 } })).toBe(false);
    expect(isEmptyEdit(withCrop())).toBe(false);
  });

  it("сервер принимает только правильное описание и поправляет кадр за краем", () => {
    expect(parsePhotoEdit(withCrop())).toEqual(withCrop());
    expect(parsePhotoEdit({ ...withCrop(), geometry: { ...withCrop().geometry, crop: { x: 0.9, y: 0, w: 0.5, h: 1 } } })?.geometry.crop).toEqual({ x: 0.5, y: 0, w: 0.5, h: 1 });
    expect(parsePhotoEdit({ ...withCrop(), layers: [text({ color: "red" })] })).toBeNull();
    expect(parsePhotoEdit({ ...withCrop(), layers: [{ ...text(), font: "comic-sans" }] })).toBeNull();
    expect(parsePhotoEdit({ ...withCrop(), layers: [text({ text: "x".repeat(501) })] })).toBeNull();
    const huge = { id: "d", type: "draw", points: new Array(MAX_DRAW_POINTS * 2 + 2).fill(0), color: "#000000", width: 0.01, brush: "pen", x: 0.5, y: 0.5, rotation: 0, scale: 1, opacity: 1 };
    expect(parsePhotoEdit({ ...withCrop(), layers: [huge] })).toBeNull();
    expect(parsePhotoEdit({ ...withCrop(), adjust: { brightness: 500 } })).toBeNull();
    expect(parsePhotoEdit("<script>")).toBeNull();
  });

  it("версия файла — по ключу хранилища", () => {
    expect(photoVersion("photos/b1/p1_r7.jpg")).toBe("p1_r7");
  });
});

describe("свет и цвет", () => {
  const px = (...rgb: number[]) => new Uint8ClampedArray(rgb.flatMap((v, i) => (i % 3 === 2 ? [v, 255] : [v])));

  it("без правок пиксели не меняются", () => {
    const d = px(10, 120, 240, 200, 100, 50);
    applyColor(d, 2, 1, {}, null, { id: "none", strength: 100 });
    expect([...d]).toEqual([10, 120, 240, 255, 200, 100, 50, 255]);
  });

  it("ч/б делает пиксель серым, сила 0 — фильтра нет", () => {
    const d = px(200, 40, 40);
    applyColor(d, 1, 1, {}, null, { id: "bw", strength: 100 });
    expect(Math.abs(d[0] - d[1])).toBeLessThanOrEqual(1);
    expect(Math.abs(d[1] - d[2])).toBeLessThanOrEqual(1);
    const e = px(200, 40, 40);
    applyColor(e, 1, 1, {}, null, { id: "bw", strength: 0 });
    expect([...e]).toEqual([200, 40, 40, 255]);
  });

  it("яркость и тепло двигают пиксели в свою сторону", () => {
    const d = px(100, 100, 100);
    applyColor(d, 1, 1, { brightness: 50, warmth: 50 }, null, { id: "none", strength: 100 });
    expect(d[0]).toBeGreaterThan(100);
    expect(d[0]).toBeGreaterThan(d[2]);
  });

  it("фильтр складывается с ползунками автора в пределах шкалы", () => {
    expect(effectiveAdjust({ saturation: 90 }, { id: "vivid", strength: 100 }).saturation).toBe(100);
    expect(effectiveAdjust({ saturation: 10 }, { id: "vivid", strength: 50 }).saturation).toBe(26);
  });

  it("«Авто» растягивает блёклый снимок: чёрная точка выше нуля, белая ниже единицы", () => {
    const n = 64;
    const d = new Uint8ClampedArray(n * 4 * 16);
    for (let i = 0; i < d.length; i += 4) {
      const v = 70 + ((i / 4) % n);
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    const l = autoLevels(d);
    expect(l.black).toBeGreaterThan(0.2);
    expect(l.white).toBeLessThan(0.75 + 1e-9);
  });
});

/** Фото как в базе (как в photo-rotate.test.ts): каждое чтение — новая копия строки. */
class RowPhotos implements PhotoRepository {
  rows = new Map<string, PhotoProps>();
  findInBook = async (_b: string, id: string) => (this.rows.has(id) ? Photo.restore(id, structuredClone(this.rows.get(id)!)) : null);
  stats = async () => ({ count: this.rows.size, maxPosition: this.rows.size - 1 });
  belongToBook = async (_b: string, list: string[]) => list.every((id) => this.rows.has(id));
  add = async (p: Photo) => void this.rows.set(p.id, strip(p));
  save = async (p: Photo) => void this.rows.set(p.id, strip(p));
  saveRotation = async (p: Photo) => {
    const { storageKey, thumbKey, width, height, inline, crop } = p.snapshot();
    this.rows.set(p.id, { ...this.rows.get(p.id)!, storageKey, thumbKey, width, height, inline, crop });
  };
  delete = async (p: Photo) => void this.rows.delete(p.id);
  reorder = async () => {};
  detachFromQuestions = async () => {};
  clearOpeners = async () => {};
}
const strip = (p: Photo): PhotoProps => {
  const { id: _id, ...props } = p.snapshot();
  void _id;
  return structuredClone(props);
};

class MemEdits implements PhotoEditRepository {
  rows = new Map<string, PhotoEditRecord>();
  find = async (id: string) => structuredClone(this.rows.get(id)) ?? null;
  save = async (id: string, e: PhotoEditRecord) => void this.rows.set(id, structuredClone(e));
  delete = async (id: string) => void this.rows.delete(id);
}

function setup() {
  const books = new MemBooks();
  books.rows.set("b1", Book.restore("b1", startBook().snapshot()));
  const photos = new RowPhotos();
  photos.rows.set("p1", { bookId: "b1", position: 0, storageKey: "photos/b1/p1.jpg", thumbKey: "photos/b1/p1_thumb.jpg", width: 1200, height: 800, caption: "Подпись", layout: "full", questionId: null, inline: null, crop: { x: 0.3, y: 0.3, zoom: 1.2 }, chapter: "a", opener: false });
  const files = new MemFiles();
  files.data.set("photos/b1/p1.jpg", Buffer.from("original"));
  files.data.set("photos/b1/p1_thumb.jpg", Buffer.from("thumb"));
  // Картинка «обрабатывается» как есть: размеры — по длине, чтобы различать файлы.
  const images: ImageProcessor = {
    maxUploadBytes: 1 << 20,
    process: async (input) => {
      if (input.toString() === "broken") throw new Error("bad image");
      return { full: input, thumb: Buffer.from(`thumb:${input}`), width: input.length * 100, height: 600 };
    },
    rotate: async (full, thumb) => ({ full: Buffer.from(`rot:${full}`), thumb }),
  };
  const edits = new MemEdits();
  const service = new PhotosService(books, photos, noQuestions, images, files, ids, new FakeUow(), undefined, edits);
  return { service, photos, files, edits };
}

describe("PhotosService: правка редактора фото", () => {
  it("сохранение: готовая картинка — файл фото, оригинал и описание остаются, место и подпись не трогаются", async () => {
    const { service, photos, files, edits } = setup();
    const { version } = await service.editState("b1", owner, "p1");
    await service.saveEdit("b1", owner, "p1", { bytes: Buffer.from("edited-1"), doc: withCrop(), version });
    const row = photos.rows.get("p1")!;
    expect(row).toMatchObject({ caption: "Подпись", chapter: "a", width: 800, height: 600, crop: { x: 0.3, y: 0.3, zoom: 1.2 } });
    expect(files.data.get(row.storageKey)?.toString()).toBe("edited-1");
    expect(edits.rows.get("p1")).toEqual({ originalKey: "photos/b1/p1.jpg", doc: withCrop() });
    // Оригинал на месте, прежняя миниатюра удалена.
    expect([...files.data.keys()].sort()).toEqual(["photos/b1/p1.jpg", row.storageKey, row.thumbKey].sort());

    // Вторая правка: оригинал тот же, прежняя правленая картинка удаляется.
    const second = await service.editState("b1", owner, "p1");
    expect(second.edit).toEqual(withCrop());
    await service.saveEdit("b1", owner, "p1", { bytes: Buffer.from("edited-22"), doc: emptyEdit(), version: second.version });
    const row2 = photos.rows.get("p1")!;
    expect(edits.rows.get("p1")?.originalKey).toBe("photos/b1/p1.jpg");
    expect([...files.data.keys()].sort()).toEqual(["photos/b1/p1.jpg", row2.storageKey, row2.thumbKey].sort());
  });

  it("правка поверх другой (фото успели повернуть) не записывается, новые файлы убираются", async () => {
    const { service, photos, files } = setup();
    const { version } = await service.editState("b1", owner, "p1");
    await service.rotate("b1", owner, "p1");
    const before = [...files.data.keys()].sort();
    await rejectsWith(service.saveEdit("b1", owner, "p1", { bytes: Buffer.from("x"), doc: withCrop(), version }), "photosOutdated");
    expect([...files.data.keys()].sort()).toEqual(before);
    expect(photos.rows.get("p1")!.storageKey).not.toBe("photos/b1/p1.jpg");
  });

  it("испорченная картинка — понятная ошибка, ничего не меняется", async () => {
    const { service, photos } = setup();
    const { version } = await service.editState("b1", owner, "p1");
    await rejectsWith(service.saveEdit("b1", owner, "p1", { bytes: Buffer.from("broken"), doc: withCrop(), version }), "photoEditInvalid");
    expect(photos.rows.get("p1")!.storageKey).toBe("photos/b1/p1.jpg");
  });

  it("«Вернуть оригинал»: файлом снова становится оригинал, правка и правленая картинка удаляются", async () => {
    const { service, photos, files, edits } = setup();
    const { version } = await service.editState("b1", owner, "p1");
    await service.saveEdit("b1", owner, "p1", { bytes: Buffer.from("edited-1"), doc: withCrop(), version });
    await service.revertEdit("b1", owner, "p1");
    const row = photos.rows.get("p1")!;
    expect(row).toMatchObject({ storageKey: "photos/b1/p1.jpg", width: 800, height: 600 });
    expect(edits.rows.has("p1")).toBe(false);
    expect([...files.data.keys()].sort()).toEqual(["photos/b1/p1.jpg", row.thumbKey].sort());
    expect((await service.editState("b1", owner, "p1")).edit).toBeNull();
  });

  it("поворот правленого фото: оригинал остаётся, правка поворачивается вместе с картинкой", async () => {
    const { service, files, edits } = setup();
    const { version } = await service.editState("b1", owner, "p1");
    await service.saveEdit("b1", owner, "p1", { bytes: Buffer.from("edited-1"), doc: withCrop(), version });
    await service.rotate("b1", owner, "p1");
    expect(edits.rows.get("p1")).toEqual({ originalKey: "photos/b1/p1.jpg", doc: rotateEditCW(withCrop()) });
    expect(files.data.has("photos/b1/p1.jpg")).toBe(true);
  });

  it("удаление правленого фото удаляет и оригинал", async () => {
    const { service, files } = setup();
    const { version } = await service.editState("b1", owner, "p1");
    await service.saveEdit("b1", owner, "p1", { bytes: Buffer.from("edited-1"), doc: withCrop(), version });
    await service.delete("b1", owner, "p1");
    expect([...files.data.keys()]).toEqual([]);
  });

  it("чужую книгу править нельзя", async () => {
    const { service } = setup();
    await rejectsWith(service.editState("b1", { userId: "u2", isStaff: false, staffEdits: false }, "p1"), "bookNotFound");
  });
});
