import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { ADJUST_KEYS, ADJUST_RANGE, emptyEdit, FILTER_IDS, MAX_LAYERS, type PhotoEdit } from "@/lib/photo-edit/doc";
import { FILTERS } from "@/lib/photo-edit/color";
import { messagesFor } from "@/i18n/messages";
import { probeOriginalImage, renderPhotoEdit } from "@/server/photo-edit-render";
import { Book, Photo, type PhotoEditRecord, type PhotoEditRepository, type PhotoProps, type PhotoRepository } from "@/modules/authoring/domain";
import { PhotosService } from "@/modules/authoring/application/services";
import type { ImageProcessor } from "@/modules/authoring/application/ports";
import { FakeUow, ids, MemBooks, MemFiles, noQuestions, startBook } from "./doubles/authoring";

const BOOK_ID = "3f2b8c1e-7a4d-4e5f-9b6c-1d2e3f4a5b6c";
const PHOTO_ID = "8a7b6c5d-4e3f-4a1b-8c9d-0e1f2a3b4c5d";
const OWNER_ID = "11111111-2222-4333-8444-555555555555";
const OTHER_ID = "99999999-2222-4333-8444-555555555555";

const ruUser = { id: OWNER_ID, name: "Анна", email: "a@x.kz", phone: null, locale: "ru", role: "user", staffDisabled: false } as never;
const kkUser = { id: OWNER_ID, name: "Айгерім", email: "k@x.kz", phone: null, locale: "kk", role: "user", staffDisabled: false } as never;
const otherUser = { id: OTHER_ID, name: "Иван", email: "i@x.kz", phone: null, locale: "ru", role: "user", staffDisabled: false } as never;

/** Создаём реальный JPEG 400×200: левая половина — ярко-красная, правая — ярко-синяя (для проверки поворота, отражения, Ч/Б и виньетки). */
async function makeTestJpeg(w = 400, h = 200): Promise<Buffer> {
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      if (x < w / 2) {
        raw[i] = 220;
        raw[i + 1] = 40;
        raw[i + 2] = 40;
      } else {
        raw[i] = 40;
        raw[i + 1] = 80;
        raw[i + 2] = 220;
      }
    }
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
}

async function pixelAt(buf: Buffer, x: number, y: number) {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return { r: data[i], g: data[i + 1], b: data[i + 2], width: info.width, height: info.height };
}

class MemPhotos implements PhotoRepository {
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

const stateRef: {
  bookStatus: "draft" | "ordered";
  photosService: PhotosService | null;
  photosRepo: MemPhotos | null;
  files: MemFiles | null;
  edits: MemEdits | null;
} = {
  bookStatus: "draft",
  photosService: null,
  photosRepo: null,
  files: null,
  edits: null,
};

vi.mock("@/i18n/server", async () => ({
  getMessages: async () => ({ api: (await import("@/i18n/messages/ru/api")).api }),
  getLocale: async () => "ru",
}));

vi.mock("@/server/rateLimit", () => ({ rateLimit: async () => true }));

vi.mock("@/server/auth", () => ({
  getCurrentUser: async () => activeUser,
}));

vi.mock("@/server/books", () => ({
  viewerOf: async (u: { id: string }) => ({ userId: u.id, isStaff: false, staffEdits: false }),
}));

vi.mock("@/server/photos-tab-data", () => ({
  photosTabData: async () => ({
    book: { id: BOOK_ID, format: "a5", interior: "classic", language: "ru", blank: false, photoPlacement: "after", galleryTitle: "Альбом", editable: stateRef.bookStatus === "draft", layoutRev: 2 },
    photos: [],
    places: [[PHOTO_ID, { kind: "after", chapterKey: "c1", auto: false, onCover: null }]],
    chapters: [],
    answers: [],
    tocLines: {},
    losses: {},
    maxPhotos: 100,
  }),
}));

vi.mock("@/server/container", () => ({
  container: () => ({
    authoring: {
      photos: stateRef.photosService!,
      photoFile: (key: string) => stateRef.files!.get(key),
      queries: {
        visibleBook: async (bookId: string, viewer: { userId: string }) => {
          if (bookId !== BOOK_ID || viewer.userId !== OWNER_ID) return null;
          return { id: BOOK_ID, userId: OWNER_ID, status: stateRef.bookStatus, format: "a5", interior: "classic", language: "ru", title: "Книга" };
        },
        photoFor: async (photoId: string) => {
          const row = stateRef.photosRepo?.rows.get(photoId);
          return row ? { id: photoId, ...row } : null;
        },
        photos: async (bookId: string) =>
          [...(stateRef.photosRepo?.rows.entries() ?? [])]
            .filter(([, p]) => p.bookId === bookId)
            .map(([id, p]) => ({ id, ...p })),
      },
    },
  }),
}));

let activeUser: unknown = ruUser;

const { PHOTO_EDITOR_ADJUST_KEYS, PHOTO_EDITOR_FILTER_IDS, PhotoEditorSaveBody } = await import("@mybook/contracts");
const { createApp } = await import("../apps/api/src/app");
const { handlers } = await import("../apps/api/src/routes");
const { HttpError } = await import("@/server/api");

const fakeAuth = (who: unknown) => ({
  user: async () => {
    if (!who) throw new HttpError(401, "unauthorized");
    activeUser = who;
    return who as never;
  },
  staff: async () => {
    throw new HttpError(403, "forbidden");
  },
});

async function setupEnv(status: "draft" | "ordered" = "draft") {
  stateRef.bookStatus = status;
  const books = new MemBooks();
  const baseBook = startBook({ userId: OWNER_ID }).snapshot();
  books.rows.set(BOOK_ID, Book.restore(BOOK_ID, { ...baseBook, status }));
  const photos = new MemPhotos();
  const orig = await makeTestJpeg(400, 200);
  photos.rows.set(PHOTO_ID, {
    bookId: BOOK_ID,
    position: 0,
    storageKey: `photos/${BOOK_ID}/${PHOTO_ID}.jpg`,
    thumbKey: `photos/${BOOK_ID}/${PHOTO_ID}_thumb.jpg`,
    width: 400,
    height: 200,
    caption: "Подпись",
    layout: "bleed",
    questionId: null,
    inline: null,
    crop: null,
    chapter: "c1",
    opener: false,
  });
  const files = new MemFiles();
  files.data.set(`photos/${BOOK_ID}/${PHOTO_ID}.jpg`, orig);
  files.data.set(`photos/${BOOK_ID}/${PHOTO_ID}_thumb.jpg`, orig);
  const images: ImageProcessor = {
    maxUploadBytes: 25 * 1024 * 1024,
    process: async (input) => {
      const meta = await sharp(input).metadata();
      const thumb = await sharp(input).resize({ width: 100, height: 100, fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
      return { full: input, thumb, width: meta.width ?? 1, height: meta.height ?? 1 };
    },
    rotate: async (full, thumb) => ({ full, thumb }),
  };
  const edits = new MemEdits();
  const photosService = new PhotosService(books, photos, noQuestions, images, files, ids, new FakeUow(), undefined, edits);
  stateRef.photosService = photosService;
  stateRef.photosRepo = photos;
  stateRef.files = files;
  stateRef.edits = edits;
  return { photos, files, edits, orig };
}

const call = (app: ReturnType<typeof createApp>, method: string, path: string, body?: unknown) =>
  app(new Request(`http://127.0.0.1:3044${path}`, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }));

describe("контракт редактора фото", () => {
  it("списки ползунков и фильтров совпадают с lib/photo-edit/doc.ts 1-в-1", () => {
    expect([...PHOTO_EDITOR_ADJUST_KEYS]).toEqual([...ADJUST_KEYS]);
    expect([...PHOTO_EDITOR_FILTER_IDS]).toEqual([...FILTER_IDS]);
  });

  it("схема сохранения отклоняет битые значения и лишние поля", () => {
    const valid = { version: PHOTO_ID, edit: emptyEdit() };
    expect(PhotoEditorSaveBody.safeParse(valid).success).toBe(true);
    expect(PhotoEditorSaveBody.safeParse({ ...valid, extra: 1 }).success).toBe(false);
    expect(PhotoEditorSaveBody.safeParse({ version: PHOTO_ID, edit: { ...emptyEdit(), geometry: { ...emptyEdit().geometry, turns: 4 } } }).success).toBe(false);
    expect(PhotoEditorSaveBody.safeParse({ version: PHOTO_ID, edit: { ...emptyEdit(), geometry: { ...emptyEdit().geometry, straighten: 60 } } }).success).toBe(false);
  });
});

describe("серверный рендер sharp (photo-edit-render)", () => {
  it("probeOriginalImage возвращает размеры и автоуровни", async () => {
    const orig = await makeTestJpeg(400, 200);
    const probe = await probeOriginalImage(orig);
    expect(probe.width).toBe(400);
    expect(probe.height).toBe(200);
    expect(probe.suggestedLevels.black).toBeGreaterThanOrEqual(0);
    expect(probe.suggestedLevels.white).toBeLessThanOrEqual(1);
  });

  it("поворот 90°, отражение, выпрямление, обрезка, ч/б и виньетка дают ожидаемые размеры и пиксели", async () => {
    const orig = await makeTestJpeg(400, 200);

    // Поворот 90° CW: 400×200 → 200×400.
    const rotated = await renderPhotoEdit(orig, { ...emptyEdit(), geometry: { ...emptyEdit().geometry, turns: 1 } });
    const rotMeta = await sharp(rotated).metadata();
    expect([rotMeta.width, rotMeta.height]).toEqual([200, 400]);

    // Отражение: слева становится синий, справа — красный.
    const flipped = await renderPhotoEdit(orig, { ...emptyEdit(), geometry: { ...emptyEdit().geometry, flip: true } });
    const leftPx = await pixelAt(flipped, 40, 100);
    expect(leftPx.b).toBeGreaterThan(leftPx.r + 80);

    // Выпрямление на 10° сохраняет размер без пустых чёрных углов.
    const straightened = await renderPhotoEdit(orig, { ...emptyEdit(), geometry: { ...emptyEdit().geometry, straighten: 10 } });
    const strMeta = await sharp(straightened).metadata();
    expect([strMeta.width, strMeta.height]).toEqual([400, 200]);
    const cornerPx = await pixelAt(straightened, 2, 2);
    expect(cornerPx.r + cornerPx.g + cornerPx.b).toBeGreaterThan(100);

    // Обрезка 50% × 50% → 200×100.
    const cropped = await renderPhotoEdit(orig, { ...emptyEdit(), geometry: { ...emptyEdit().geometry, crop: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, aspect: "free" } });
    const cropMeta = await sharp(cropped).metadata();
    expect([cropMeta.width, cropMeta.height]).toEqual([200, 100]);

    // Ч/Б фильтр обесцвечивает пиксели.
    const bw = await renderPhotoEdit(orig, { ...emptyEdit(), filter: { id: "bw", strength: 100 } });
    const bwPx = await pixelAt(bw, 50, 100);
    expect(Math.abs(bwPx.r - bwPx.g)).toBeLessThanOrEqual(4);
    expect(Math.abs(bwPx.g - bwPx.b)).toBeLessThanOrEqual(4);

    // Виньетка затемняет углы относительно центра.
    const vig = await renderPhotoEdit(orig, { ...emptyEdit(), adjust: { vignette: 100 } });
    const center = await pixelAt(vig, 100, 100);
    const corner = await pixelAt(vig, 2, 2);
    expect(corner.r).toBeLessThan(center.r - 40);
  });
});

describe("API v1 редактора фото", () => {
  const url = `/api/v1/books/${BOOK_ID}/photos/${PHOTO_ID}/editor`;

  it("без входа — 401; чужая книга — 404", async () => {
    await setupEnv("draft");
    expect((await call(createApp(handlers, fakeAuth(null)), "GET", url)).status).toBe(401);
    expect((await call(createApp(handlers, fakeAuth(otherUser)), "GET", url)).status).toBe(404);
  });

  it("заказанная книга заблокирована на GET, PUT и DELETE (409 bookLocked)", async () => {
    await setupEnv("ordered");
    const app = createApp(handlers, fakeAuth(ruUser));
    const g = await call(app, "GET", url);
    expect(g.status).toBe(409);
    expect(await g.json()).toMatchObject({ code: "bookLocked" });

    const p = await call(app, "PUT", url, { version: PHOTO_ID, edit: emptyEdit() });
    expect(p.status).toBe(409);
    expect(await p.json()).toMatchObject({ code: "bookLocked" });

    const d = await call(app, "DELETE", url);
    expect(d.status).toBe(409);
    expect(await d.json()).toMatchObject({ code: "bookLocked" });
  });

  it("GET отдаёт локализованные подписи (ru и kk), диапазоны ADJUST_RANGE, пресеты FILTERS и слот книги", async () => {
    await setupEnv("draft");
    const resRu = await call(createApp(handlers, fakeAuth(ruUser)), "GET", url);
    expect(resRu.status).toBe(200);
    const dataRu = await resRu.json();
    expect(dataRu.edited).toBe(false);
    expect(dataRu.originalWidth).toBe(400);
    expect(dataRu.originalHeight).toBe(200);
    expect(dataRu.limits.maxLayers).toBe(MAX_LAYERS);
    expect(dataRu.labels.title).toBe(messagesFor("ru").editor.photoEditor.title);
    expect(dataRu.labels.cropSmallTemplate).toContain("{px}");
    expect(dataRu.labels.lowDpiTemplate).toContain("{dpi}");
    expect(dataRu.slot).toMatchObject({ mode: "cover" });
    expect(dataRu.aspects.some((a: { key: string }) => a.key === "slot")).toBe(true);
    expect(dataRu.adjustControls).toHaveLength(ADJUST_KEYS.length);
    for (const c of dataRu.adjustControls as { key: (typeof ADJUST_KEYS)[number]; min: number; max: number }[]) {
      expect([c.min, c.max]).toEqual([...ADJUST_RANGE[c.key]]);
    }
    expect(dataRu.filters).toHaveLength(FILTER_IDS.length);
    expect(dataRu.filters.find((f: { id: string }) => f.id === "bw").mono).toBe(FILTERS.bw.mono);

    const resKk = await call(createApp(handlers, fakeAuth(kkUser)), "GET", url);
    expect(resKk.status).toBe(200);
    const dataKk = await resKk.json();
    expect(dataKk.labels.title).toBe(messagesFor("kk").editor.photoEditor.title);
    expect(dataKk.labels.save).toBe(messagesFor("kk").editor.photoEditor.save);
  });

  it("PUT пересобирает картинку через sharp, сохраняет photo_edits, отбивает устаревшую версию; DELETE возвращает оригинал", async () => {
    const { edits } = await setupEnv("draft");
    const app = createApp(handlers, fakeAuth(ruUser));

    const first = await (await call(app, "GET", url)).json();
    const editDoc: PhotoEdit = {
      ...emptyEdit(),
      geometry: { turns: 1, flip: false, straighten: 0, crop: { x: 0, y: 0, w: 1, h: 0.5 }, aspect: "1:1" },
      adjust: { brightness: 15, contrast: 10 },
      filter: { id: "bw", strength: 80 },
    };

    const saveRes = await call(app, "PUT", url, { version: first.version, edit: editDoc });
    expect(saveRes.status).toBe(200);
    const saved = await saveRes.json();
    expect(saved.edited).toBe(true);
    // После поворота 400×200 → 200×400 и crop h=0.5 → 200×200.
    expect([saved.width, saved.height]).toEqual([200, 200]);
    expect(saved.version).not.toBe(first.version);
    expect(saved.thumbUrl).toContain(`v=${saved.version}`);
    expect(edits.rows.get(PHOTO_ID)?.doc).toMatchObject({ filter: { id: "bw", strength: 80 } });

    // Повторное сохранение со старой версией — 409 photosOutdated.
    const stale = await call(app, "PUT", url, { version: first.version, edit: editDoc });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ code: "photosOutdated" });

    // Недопустимое значение ползунка — 400 photoEditInvalid.
    const bad = await call(app, "PUT", url, { version: saved.version, edit: { ...emptyEdit(), adjust: { brightness: 500 } } });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ code: "photoEditInvalid" });

    // DELETE возвращает оригинал (400×200) и очищает photo_edits.
    const delRes = await call(app, "DELETE", url);
    expect(delRes.status).toBe(200);
    const reverted = await delRes.json();
    expect(reverted.edited).toBe(false);
    expect([reverted.width, reverted.height]).toEqual([400, 200]);
    expect(edits.rows.has(PHOTO_ID)).toBe(false);
  });

  it("PUT с пустой правкой на ранее правленом фото автоматически возвращает оригинал", async () => {
    const { edits } = await setupEnv("draft");
    const app = createApp(handlers, fakeAuth(ruUser));
    const first = await (await call(app, "GET", url)).json();
    const saved = await (await call(app, "PUT", url, { version: first.version, edit: { ...emptyEdit(), filter: { id: "sepia", strength: 100 } } })).json();
    expect(edits.rows.has(PHOTO_ID)).toBe(true);

    const cleared = await call(app, "PUT", url, { version: saved.version, edit: emptyEdit() });
    expect(cleared.status).toBe(200);
    expect((await cleared.json()).edited).toBe(false);
    expect(edits.rows.has(PHOTO_ID)).toBe(false);
  });
});
