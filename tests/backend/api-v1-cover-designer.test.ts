import type { ApiFetch } from "./api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { COVER_DESIGN_LIMITS, CoverDesignInitBody, CoverDesignResetBody, CoverDesignSaveBody, CoverPatch } from "@mybook/contracts";
import { COVER_LIMITS, coverLayouts, DECOR_IDS } from "@/lib/book/cover-design";
import { fontKeys } from "@/lib/book/fonts";
import { MAX_ZOOM } from "@/lib/book/photo-frame";

const BOOK_ID = "3f2b8c1e-7a4d-4e5f-9b6c-1d2e3f4a5b6c";
const PHOTO_1 = "11111111-2222-4333-8444-555555555501";
const PHOTO_2 = "11111111-2222-4333-8444-555555555502";
const USER_ID = "11111111-2222-4333-8444-555555555555";

let currentLocale: "ru" | "kk" = "ru";
let bookState: Record<string, unknown>;
let bookPhotos: { id: string; width: number; height: number }[];
const updateSettingsMock = vi.fn();

vi.mock("@/i18n/server", async (orig) => {
  const { messagesFor } = await import("@/i18n/messages");
  return {
    ...(await orig<object>()),
    getLocale: async () => currentLocale,
    getMessages: async () => messagesFor(currentLocale),
  };
});

vi.mock("@/server/api", async (orig) => {
  const actual = await orig<typeof import("@/server/api")>();
  return {
    ...actual,
    apiBook: vi.fn(async (_req: Request, _bookId: string, opts?: { editable?: boolean }) => {
      if (opts?.editable && bookState.status !== "draft") {
        throw new actual.HttpError(409, "bookLocked");
      }
      return {
        book: bookState,
        viewer: { userId: USER_ID, isStaff: false, canEdit: true },
      };
    }),
  };
});

vi.mock("@/server/container", () => ({
  container: () => ({
    authoring: {
      photoRepository: {},
      books: {
        updateSettings: updateSettingsMock,
      },
      queries: {
        book: async () => bookState,
        // Книга для BookAccessGuard бэкенда (своя книга владельца).
        visibleBook: async () => bookState,
        photos: async () => bookPhotos,
      },
    },
  }),
}));

const { nestApi, legacyAuth } = await import("./api");
const { HttpError } = await import("@/server/api");

const user = { id: USER_ID, name: "Айгерим", email: "a@x.kz", phone: null, locale: "ru", role: "user", staffDisabled: false } as never;
const fakeAuth = {
  user: async () => user,
  staff: async () => {
    throw new HttpError(403, "forbidden");
  },
};

function makeApp() {
  return nestApi({ auth: legacyAuth(fakeAuth) });
}

const call = (app: ApiFetch, method: string, path: string, body?: unknown) =>
  // Язык ответа — заголовком сайта x-mb-locale (как у веба), а не подменой getLocale.
  app(new Request(`http://127.0.0.1:3044${path}`, { method, headers: { "x-mb-locale": currentLocale, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined }));

beforeEach(() => {
  currentLocale = "ru";
  bookPhotos = [
    { id: PHOTO_1, width: 2400, height: 1800 },
    { id: PHOTO_2, width: 1800, height: 2400 },
  ];
  bookState = {
    id: BOOK_ID,
    userId: USER_ID,
    status: "draft",
    format: "a5",
    theme: "love",
    language: "ru",
    title: "Наша история",
    subtitle: "Четыре года вместе",
    authorName: "Айгерим",
    recordedBy: "",
    recipientName: "Арман",
    hideRecipientOnCover: false,
    namesOnCover: "",
    coverTemplate: "linen",
    coverLines: true,
    coverPhotoId: PHOTO_1,
    coverPhotoExtra: [],
    backText: "С любовью",
    backLayout: "quote",
    backPhotoId: PHOTO_2,
    backPhotoExtra: [],
    coverDesign: null,
    coverBack: null,
    photoFrames: {},
    occasionDate: "2026-06-15",
  };
  updateSettingsMock.mockReset();
  updateSettingsMock.mockImplementation(async (_id: string, _viewer: unknown, patch: Record<string, unknown>) => {
    bookState = { ...bookState, ...patch };
  });
});

describe("контракт конструктора обложки", () => {
  it("лимиты COVER_DESIGN_LIMITS в @mybook/contracts/limits совпадают с доменными COVER_LIMITS и MAX_ZOOM", () => {
    expect(COVER_DESIGN_LIMITS.layers).toBe(COVER_LIMITS.layers);
    expect(COVER_DESIGN_LIMITS.text).toBe(COVER_LIMITS.text);
    expect(COVER_DESIGN_LIMITS.name).toBe(COVER_LIMITS.name);
    expect(COVER_DESIGN_LIMITS.bleed).toBe(COVER_LIMITS.bleed);
    expect(COVER_DESIGN_LIMITS.minSize).toBe(COVER_LIMITS.minSize);
    expect(COVER_DESIGN_LIMITS.maxSize).toBe(COVER_LIMITS.maxSize);
    expect(COVER_DESIGN_LIMITS.fontSizeMin).toBe(COVER_LIMITS.fontSize[0]);
    expect(COVER_DESIGN_LIMITS.fontSizeMax).toBe(COVER_LIMITS.fontSize[1]);
    expect(COVER_DESIGN_LIMITS.strokeMax).toBe(COVER_LIMITS.stroke[1]);
    expect(COVER_DESIGN_LIMITS.borderMax).toBe(COVER_LIMITS.border[1]);
    expect(COVER_DESIGN_LIMITS.frameZoomMax).toBe(MAX_ZOOM);
  });

  it("схемы конструктора строго валидируют слои, лимиты и обратную совместимость CoverPatch", () => {
    // CoverPatch по-прежнему отклоняет произвольный coverDesign (обратная совместимость)
    expect(CoverPatch.safeParse({ coverDesign: {} }).success).toBe(false);
    expect(CoverPatch.safeParse({ coverLines: false, title: "Книга" }).success).toBe(true);

    // CoverDesignSaveBody принимает все 4 вида слоёв (включая декоративные рамки и кадры фото)
    const ok = CoverDesignSaveBody.safeParse({
      coverDesign: {
        v: 1,
        background: { kind: "gradient", from: "#1F1A17", to: "#7A1F2B", angle: 120 },
        layers: [
          { id: "t1", kind: "text", bind: "title", text: "", x: 0.1, y: 0.2, w: 0.8, h: 0.14, style: { font: "prata", weight: 400, size: 0.09, color: "#FFFFFF", align: "center", valign: "middle" } },
          { id: "p1", kind: "image", photoId: PHOTO_1, x: 0.15, y: 0.4, w: 0.7, h: 0.4, mask: "arch", frame: { zoom: 1.5, x: 0.4, y: 0.6 }, border: { color: "#F3D9A4", width: 0.01 } },
          { id: "s1", kind: "shape", shape: "double", stroke: "#B8925A", strokeWidth: 0.004, x: 0.06, y: 0.04, w: 0.88, h: 0.92 },
          { id: "d1", kind: "decor", motif: "laurel", color: "#B8925A", x: 0.4, y: 0.85, w: 0.2, h: 0.08 },
        ],
      },
      photoFrames: [{ key: "cover:0", frame: { zoom: 2, x: 0.3, y: 0.7 } }],
    });
    expect(ok.success).toBe(true);

    // Слишком много слоёв и неверный ключ кадра отклоняются
    const tooMany = CoverDesignSaveBody.safeParse({
      coverDesign: {
        v: 1,
        background: { kind: "template" },
        layers: Array.from({ length: COVER_LIMITS.layers + 1 }, (_, i) => ({ id: `l${i}`, kind: "shape", shape: "line", x: 0.1, y: 0.1, w: 0.5, h: 0.02 })),
      },
    });
    expect(tooMany.success).toBe(false);
    expect(CoverDesignSaveBody.safeParse({ photoFrames: [{ key: "bad:0", frame: { zoom: 1, x: 0.5, y: 0.5 } }] }).success).toBe(false);
    expect(CoverDesignInitBody.safeParse({ side: "front", layoutId: "premium-deco" }).success).toBe(true);
    expect(CoverDesignInitBody.safeParse({ side: "spine" }).success).toBe(false);
    expect(CoverDesignResetBody.safeParse({ side: "back" }).success).toBe(true);
  });
});

describe("маршруты API v1 конструктора обложки", () => {
  it("GET /api/v1/books/{id}/cover отдаёт полный каталог конструктора, SVG-иконки, палитры, лимиты и надписи (ru и kk)", async () => {
    const app = await makeApp();
    const resRu = await call(app, "GET", `/api/v1/books/${BOOK_ID}/cover`);
    expect(resRu.status).toBe(200);
    const data = await resRu.json();

    expect(data.cover.hasDesign).toBe(false);
    expect(data.cover.hasBackDesign).toBe(false);
    expect(data.cover.board.w).toBeGreaterThan(100);
    expect(data.cover.board.h).toBeGreaterThan(100);
    expect(data.cover.safeFront.w).toBeGreaterThan(0.7);
    expect(data.cover.spreadImageUrl).toContain("side=spread");
    expect(data.cover.templateBgUrl).toBeTruthy();
    expect(data.cover.backTemplateBgUrl).toBeTruthy();
    expect(data.cover.backPhotoIds).toEqual([PHOTO_2]);

    const dz = data.designer;
    expect(dz.fonts.map((f: { id: string }) => f.id)).toEqual(fontKeys);
    expect(dz.decors.map((d: { id: string }) => d.id)).toEqual(DECOR_IDS);
    expect(dz.layouts.map((l: { id: string }) => l.id)).toEqual(coverLayouts.map((l) => l.id));
    expect(dz.shapes.map((s: { id: string }) => s.id)).toEqual(["rect", "ellipse", "line", "frame", "double", "corners", "arch"]);
    // Значки фигур (в т.ч. «Декоративные линии» — line, frame, double, corners) и декора — валидный SVG с сервера
    for (const s of dz.shapes) expect(s.svg).toMatch(/^<svg /);
    for (const d of dz.decors) expect(d.svg).toMatch(/^<svg /);
    expect(dz.textPresets.length).toBe(4);
    expect(dz.stockPhotos.length).toBeGreaterThan(20);
    expect(dz.swatches.length).toBeGreaterThan(5);
    expect(dz.backSwatches.length).toBeGreaterThan(5);
    expect(dz.limits.layers).toBe(COVER_LIMITS.layers);
    expect(dz.labels.modes.designer).toBe("Конструктор");

    // Локаль kk отдаёт казахские надписи из словарей сайта
    currentLocale = "kk";
    const resKk = await call(app, "GET", `/api/v1/books/${BOOK_ID}/cover`);
    expect(resKk.status).toBe(200);
    const kk = await resKk.json();
    expect(kk.designer.labels.modes.designer).toBe("Құрастырушы");
  });

  it("POST /cover/design/init собирает слои лица из шаблона, применяет готовый макет и раскладывает оборот слоями", async () => {
    const app = await makeApp();

    // 1. Инициализация лица из текущего шаблона
    const initFront = await call(app, "POST", `/api/v1/books/${BOOK_ID}/cover/design/init`, { side: "front" });
    expect(initFront.status).toBe(200);
    const frontData = await initFront.json();
    expect(frontData.cover.hasDesign).toBe(true);
    expect(frontData.cover.coverDesign.layers.length).toBeGreaterThan(0);
    expect(frontData.cover.coverDesign.layers.some((l: { bind?: string }) => l.bind === "title")).toBe(true);

    // 2. Применение готового макета с декоративной рамкой («Золото» — premium-deco)
    const applyLayout = await call(app, "POST", `/api/v1/books/${BOOK_ID}/cover/design/init`, { side: "front", layoutId: "premium-deco" });
    expect(applyLayout.status).toBe(200);
    const layoutData = await applyLayout.json();
    expect(layoutData.cover.hasDesign).toBe(true);
    expect(layoutData.cover.coverDesign.layers.some((l: { kind: string; shape?: string }) => l.kind === "shape" && l.shape === "double")).toBe(true);

    // 3. Неизвестный макет → 400
    const badLayout = await call(app, "POST", `/api/v1/books/${BOOK_ID}/cover/design/init`, { side: "front", layoutId: "no-such-layout" });
    expect(badLayout.status).toBe(400);

    // 4. Раскладка оборота слоями («Полароиды»)
    const initBack = await call(app, "POST", `/api/v1/books/${BOOK_ID}/cover/design/init`, { side: "back", backLayout: "polaroids" });
    expect(initBack.status).toBe(200);
    const backData = await initBack.json();
    expect(backData.cover.hasBackDesign).toBe(true);
    expect(backData.cover.coverBack.layers.some((l: { kind: string }) => l.kind === "image")).toBe(true);
  });

  it("PUT /cover/design сохраняет слои, декоративные линии, кадры фото, фон оборота и привязанный текст", async () => {
    const app = await makeApp();
    const beforeImg = (await (await call(app, "GET", `/api/v1/books/${BOOK_ID}/cover`)).json()).cover.imageUrl;

    const saveRes = await call(app, "PUT", `/api/v1/books/${BOOK_ID}/cover/design`, {
      title: "Обновлённое название",
      coverLines: false,
      coverDesign: {
        v: 1,
        background: { kind: "color", color: "#2B1B2E" },
        layers: [
          { id: "title", kind: "text", bind: "title", text: "", x: 0.1, y: 0.3, w: 0.8, h: 0.14, style: { font: "playfair", weight: 600, size: 0.08, color: "#F3D9A4", align: "center", valign: "middle" } },
          { id: "frame1", kind: "shape", shape: "corners", stroke: "#F3D9A4", strokeWidth: 0.005, x: 0.06, y: 0.04, w: 0.88, h: 0.92 },
        ],
      },
      coverBack: { v: 1, background: { kind: "color", color: "#1F1A17" } },
      photoFrames: [{ key: "cover:0", frame: { zoom: 1.8, x: 0.25, y: 0.75 } }],
    });
    expect(saveRes.status).toBe(200);
    const saved = await saveRes.json();
    expect(saved.cover.title).toBe("Обновлённое название");
    expect(saved.cover.lines).toBe(false);
    expect(saved.cover.hasDesign).toBe(true);
    expect(saved.cover.coverDesign.background).toEqual({ kind: "color", color: "#2B1B2E" });
    expect(saved.cover.coverDesign.layers).toHaveLength(2);
    expect(saved.cover.coverBack).toEqual({ v: 1, background: { kind: "color", color: "#1F1A17" } });
    expect(saved.cover.photoFrames).toEqual([{ key: "cover:0", frame: { zoom: 1.8, x: 0.25, y: 0.75 } }]);
    // Версия картинки обложки обновилась после правки
    expect(saved.cover.imageUrl).not.toBe(beforeImg);
    expect(updateSettingsMock).toHaveBeenCalledTimes(1);
  });

  it("POST /cover/design/reset сбрасывает лицо к шаблону и оборот к варианту (сохраняя свой фон оборота)", async () => {
    const app = await makeApp();
    bookState.coverDesign = { v: 1, background: { kind: "color", color: "#111111" }, layers: [] };
    bookState.coverBack = {
      v: 1,
      background: { kind: "color", color: "#7A1F2B" },
      layers: [{ id: "bt0", kind: "text", text: "Привет", x: 0.1, y: 0.2, w: 0.8, h: 0.1, style: { font: "lora", weight: 400, size: 0.04, color: "#FFFFFF", align: "center", valign: "middle" } }],
    };

    // Сброс лица с заменой шаблона
    const resetFront = await call(app, "POST", `/api/v1/books/${BOOK_ID}/cover/design/reset`, { side: "front", coverTemplate: "linen" });
    expect(resetFront.status).toBe(200);
    const fd = await resetFront.json();
    expect(fd.cover.hasDesign).toBe(false);
    expect(fd.cover.coverDesign).toBeNull();

    // Сброс оборота: слои убрались, а свой цвет фона остался
    const resetBack = await call(app, "POST", `/api/v1/books/${BOOK_ID}/cover/design/reset`, { side: "back" });
    expect(resetBack.status).toBe(200);
    const bd = await resetBack.json();
    expect(bd.cover.hasBackDesign).toBe(false);
    expect(bd.cover.coverBack).toEqual({ v: 1, background: { kind: "color", color: "#7A1F2B" } });
  });

  it("заказанная книга (status !== draft) блокирует все мутации конструктора (409 bookLocked)", async () => {
    bookState.status = "ordered";
    const app = await makeApp();
    expect((await call(app, "POST", `/api/v1/books/${BOOK_ID}/cover/design/init`, { side: "front" })).status).toBe(409);
    expect((await call(app, "PUT", `/api/v1/books/${BOOK_ID}/cover/design`, { coverLines: false })).status).toBe(409);
    expect((await call(app, "POST", `/api/v1/books/${BOOK_ID}/cover/design/reset`, { side: "front" })).status).toBe(409);
    // Чтение при этом доступно с editable: false
    const getRes = await call(app, "GET", `/api/v1/books/${BOOK_ID}/cover`);
    expect(getRes.status).toBe(200);
    expect((await getRes.json()).cover.editable).toBe(false);
  });
});
