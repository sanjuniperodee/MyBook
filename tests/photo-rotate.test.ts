import { describe, expect, it } from "vitest";
import { Book, Photo, type PhotoProps, type PhotoRepository } from "@/modules/authoring/domain";
import { PhotosService } from "@/modules/authoring/application/services";
import type { ImageProcessor } from "@/modules/authoring/application/ports";
import { FakeUow, ids, MemBooks, MemFiles, noQuestions, owner, rejectsWith, startBook } from "./doubles/authoring";

/**
 * Поворот фото: файлы обрабатываются секунды и без блокировки, а запись — под блокировкой книги по перечитанной строке
 * и только полей поворота. Правка места (или перевод на правила 2), записанная за время обработки, не откатывается.
 */

/** Фото как в базе: каждое чтение — новая копия строки, save пишет строку целиком, saveRotation — только поля поворота. */
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

function setup() {
  const books = new MemBooks();
  books.rows.set("b1", Book.restore("b1", startBook().snapshot()));
  const photos = new RowPhotos();
  photos.rows.set("p1", { bookId: "b1", position: 0, storageKey: "photos/b1/p1.jpg", thumbKey: "photos/b1/p1_thumb.jpg", width: 1200, height: 800, caption: "", layout: "full", questionId: null, inline: null, crop: { x: 0.2, y: 0.3, zoom: 1.5 }, chapter: null, opener: false });
  const files = new MemFiles();
  files.data.set("photos/b1/p1.jpg", Buffer.from("full"));
  files.data.set("photos/b1/p1_thumb.jpg", Buffer.from("thumb"));
  // Обработка картинки ждёт, пока тест не отпустит: за это время идёт правка места.
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const images: ImageProcessor = { maxUploadBytes: 1 << 20, process: async () => ({ full: Buffer.alloc(0), thumb: Buffer.alloc(0), width: 1, height: 1 }), rotate: async (full, thumb) => (await gate, { full, thumb }) };
  const service = new PhotosService(books, photos, noQuestions, images, files, ids, new FakeUow());
  return { service, photos, files, books, release };
}

describe("PhotosService.rotate", () => {
  it("правка места за время обработки остаётся: пишутся только файлы, размеры и кадр — под блокировкой книги", async () => {
    const { service, photos, files, books, release } = setup();
    const rotating = service.rotate("b1", owner, "p1");
    await new Promise((r) => setTimeout(r, 0));
    await service.update("b1", owner, "p1", { chapter: "a", opener: true, caption: "Подпись" });
    const locks = books.locks;
    release();
    const photo = await rotating;
    const row = photos.rows.get("p1")!;
    expect(row).toMatchObject({ chapter: "a", opener: true, caption: "Подпись", width: 800, height: 1200 });
    expect(row.crop).toEqual(photo.snapshot().crop);
    expect(row.storageKey).not.toBe("photos/b1/p1.jpg");
    expect(books.locks).toBe(locks + 1);
    // Прежние файлы удалены, новые на месте.
    expect([...files.data.keys()].sort()).toEqual([row.storageKey, row.thumbKey].sort());
  });

  it("фото за это время повернули ещё раз или удалили — новые файлы убираются, строка не меняется", async () => {
    const { service, photos, files, release } = setup();
    const rotating = service.rotate("b1", owner, "p1");
    await new Promise((r) => setTimeout(r, 0));
    photos.rows.set("p1", { ...photos.rows.get("p1")!, storageKey: "photos/b1/p1_other.jpg" });
    release();
    await rejectsWith(rotating, "photosOutdated");
    expect(photos.rows.get("p1")).toMatchObject({ storageKey: "photos/b1/p1_other.jpg", width: 1200, height: 800 });
    expect([...files.data.keys()].sort()).toEqual(["photos/b1/p1.jpg", "photos/b1/p1_thumb.jpg"]);

    const second = setup();
    const gone = second.service.rotate("b1", owner, "p1");
    await new Promise((r) => setTimeout(r, 0));
    second.photos.rows.delete("p1");
    second.release();
    await rejectsWith(gone, "photoNotFound");
    expect([...second.files.data.keys()].sort()).toEqual(["photos/b1/p1.jpg", "photos/b1/p1_thumb.jpg"]);
  });
});
