import { describe, expect, it, vi } from "vitest";
import { GALLERY_KEY, parseTocLines } from "@/lib/book/toc";
import { PHOTO_OFF_KEY, type BookContent } from "@/lib/book/layout";
import { layoutSignature } from "@/lib/book/layout-signature";
import { withCoverPhotos } from "@/lib/book/cover-photos";
import { photoPlaceOf } from "@/lib/book/photo-place";
import { Book, NEW_BOOK_LAYOUT_REV, Photo, UPGRADE_ON_TOUCH } from "@/modules/authoring/domain";
import { LAYOUT_REV2_APPLY } from "@/modules/authoring/domain/layout-rev";
import { BooksService, PhotosService } from "@/modules/authoring/application/services";
import { LayoutRev2Service, planLayoutRev2, type LayoutBundle, type LayoutRevStore, type PhotoPin } from "@/modules/authoring/application/layout-rev2";
import { FakeUow, ids, images, MemBooks, MemFiles, MemPhotos, noChapters, noQuestions, owner, rejectsWith, startBook, stranger, themes } from "./doubles/authoring";
import { applyPins, buildLayout, layoutBundle, layoutPhoto as photo, layoutQuestion, YEAR } from "./fixtures/layout-books";
import { parseLayoutRev2Args } from "../scripts/layout-rev2-args";

/** Где стоят фото в собранной книге: главы (фото начала, фото после главы, фото в ответах), альбом. */
function where(c: BookContent) {
  return {
    chapters: c.chapters.map((ch) => ({ key: ch.key, opener: ch.openerPhoto?.id ?? null, after: ch.photos.map((p) => p.id), answers: ch.items.flatMap((it) => (it.photos ?? []).map((p) => p.id)) })),
    album: c.galleryPhotos.map((p) => p.id),
  };
}
const rev = (b: LayoutBundle, layoutRev: number, book: Partial<LayoutBundle["book"]> = {}) => where(buildLayout({ ...b, book: { ...b.book, ...book } }, b.photos, layoutRev));

describe("правила раскладки фото: прежние (1) и «одно место» (2)", () => {
  // Три главы, шесть фото без выбранного места: по прежним правилам — по два на главу, первое — на начальную полосу.
  const six = layoutBundle({ chapters: ["a", "b", "c"], photos: [0, 1, 2, 3, 4, 5].map((i) => photo(`p${i}`, i)) });

  it("прежние правила: первое фото главы — само на начальную полосу; правила 2 сами фото главы не ставят", () => {
    expect(rev(six, 1).chapters.map((c) => [c.opener, c.after])).toEqual([
      ["p0", ["p1"]],
      ["p2", ["p3"]],
      ["p4", ["p5"]],
    ]);
    expect(rev(six, 2).chapters.map((c) => [c.opener, c.after])).toEqual([
      [null, ["p0", "p1"]],
      [null, ["p2", "p3"]],
      [null, ["p4", "p5"]],
    ]);
  });

  it("книга без версии правил собирается как на правилах 1 — то же содержимое до байта", () => {
    const { layoutRev: _r, ...noRev } = six.book;
    void _r;
    expect(JSON.stringify(buildLayout({ ...six, book: { ...noRev, layoutRev: undefined as unknown as number } }, six.photos, undefined as unknown as number))).toBe(JSON.stringify(buildLayout(six, six.photos, 1)));
  });

  it("фото главы, выбранное автором: в правилах 2 — только оно; отметка своей главы важнее отметки влитой", () => {
    const b = layoutBundle({
      chapters: ["a", "b"],
      photos: [photo("p0", 0, { chapter: "a" }), photo("p1", 1, { chapter: "b", opener: true }), photo("p2", 2, { chapter: "a", opener: true })],
    });
    expect(rev(b, 2).chapters.map((c) => [c.opener, c.after])).toEqual([
      ["p2", ["p0"]],
      ["p1", []],
    ]);
    // Глава b убрана автором (её истории — в a): отметка своей главы a важнее отметки влитой b.
    const folded = { ...b, book: { ...b.book, tocMode: "chapters" as const, tocLines: { "c:b": { hidden: true } } } };
    expect(where(buildLayout(folded, folded.photos, 2)).chapters).toEqual([{ key: "a", opener: "p2", after: ["p0", "p1"], answers: [] }]);
    // Без отметки своей главы правила 2 берут отметку влитой; прежние правила её не видят и ставят первое фото главы.
    const onlyFolded = { ...folded, photos: folded.photos.map((p) => (p.id === "p2" ? { ...p, opener: false } : p)) };
    expect(where(buildLayout(onlyFolded, onlyFolded.photos, 2)).chapters[0]).toMatchObject({ opener: "p1", after: ["p0", "p2"] });
    expect(where(buildLayout(onlyFolded, onlyFolded.photos, 1)).chapters[0]).toMatchObject({ opener: "p0", after: ["p1", "p2"] });
  });

  it("смена оформления не теряет отметку: без фото главы отмеченное фото стоит после главы, с ним — снова на начальной полосе", () => {
    const b = layoutBundle({ chapters: ["a"], photos: [photo("p0", 0, { chapter: "a" }), photo("p1", 1, { chapter: "a", opener: true }), photo("p2", 2)] });
    expect(rev(b, 2, { interior: "classic" }).chapters[0]).toMatchObject({ opener: null, after: ["p0", "p1", "p2"] });
    expect(rev(b, 2, { interior: "luna" }).chapters[0]).toMatchObject({ opener: "p1", after: ["p0", "p2"] });
  });

  it("альбом в конце (__gallery) и «не печатается» (__off) — при любых правилах; альбом — раньше фото по правилу и даже при «не печатать»", () => {
    const b = layoutBundle({ chapters: ["a"], photos: [photo("p0", 0), photo("p1", 1, { chapter: GALLERY_KEY }), photo("p2", 2, { chapter: PHOTO_OFF_KEY }), photo("p3", 3)], book: { photoPlacement: "end", interior: "classic" } });
    for (const r of [1, 2]) {
      expect(rev(b, r).album).toEqual(["p1", "p0", "p3"]);
      expect(rev(b, r, { photoPlacement: "none" }).album).toEqual(["p1"]);
      expect(JSON.stringify(rev(b, r, { photoPlacement: "chapters" }))).not.toContain("p2");
    }
  });

  it("снимок обложки в ответе: прежние правила его прячут, правила 2 печатают", () => {
    const b = layoutBundle({ chapters: ["a"], photos: [photo("p0", 0, { questionId: "q-a" })], book: { coverPhotoId: "p0" } });
    expect(rev(b, 1).chapters[0].answers).toEqual([]);
    expect(rev(b, 2).chapters[0].answers).toEqual(["p0"]);
  });

  it("снимки обложки и оборота: правила 2 не ставят внутрь ни один сам, выбранное место — печатают", () => {
    const b = layoutBundle({
      chapters: ["a", "b"],
      photos: [photo("p0", 0), photo("p1", 1), photo("p2", 2), photo("p3", 3), photo("p4", 4, { chapter: "b" })],
      book: { interior: "classic", coverPhotoId: "p0", coverPhotoExtra: ["p1"], backPhotoId: "p2", backPhotoExtra: ["p4"] },
    });
    // Прежние: внутрь не идёт только основное фото обложки.
    expect(rev(b, 1).chapters.map((c) => c.after)).toEqual([["p1", "p2"], ["p4", "p3"]]);
    expect(rev(b, 2).chapters.map((c) => c.after)).toEqual([["p3"], ["p4"]]);
  });

  it("снимки, которых на обложке не видно (шаблон с меньшим числом мест, вариант оборота без фото), правила 2 печатают внутри", () => {
    // Шаблон на одно фото после коллажа на три: p1 и p2 остались в coverPhotoExtra; оборот с цитатой фото не показывает.
    const b = layoutBundle({
      chapters: ["a"],
      photos: [0, 1, 2, 3, 4].map((i) => photo(`p${i}`, i)),
      book: { interior: "classic", coverTemplate: "photo", coverPhotoId: "p0", coverPhotoExtra: ["p1", "p2"], backLayout: "quote", backText: "", backPhotoId: "p3", backPhotoExtra: [] },
    });
    expect(rev(b, 2).chapters[0].after).toEqual(["p1", "p2", "p3", "p4"]);
    expect(rev(b, 2, { coverTemplate: "collage" }).chapters[0].after).toEqual(["p3", "p4"]);
    expect(rev(b, 2, { backLayout: "photo" }).chapters[0].after).toEqual(["p1", "p2", "p4"]);
    // Полароиды показывают не больше трёх снимков: четвёртый — внутри.
    expect(rev(b, 2, { coverTemplate: "linen", backLayout: "polaroids", backPhotoExtra: ["p1", "p2", "p4"] }).chapters[0].after).toEqual(["p0", "p4"]);
    // Прежние правила не меняются: внутрь не идёт только основное фото обложки — и у шаблона без фото.
    expect(rev(b, 1, { coverTemplate: "linen" }).chapters[0].after).toEqual(["p1", "p2", "p3", "p4"]);
    const places = photoPlaceOf(buildLayout(b, b.photos, 2), b.photos, withCoverPhotos(b.book, b.photos.map((p) => p.id)));
    expect([...places].map(([id, p]) => [id, p.kind, p.onCover])).toEqual([
      ["p0", "off", "cover"],
      ["p1", "after", null],
      ["p2", "after", null],
      ["p3", "after", null],
      ["p4", "after", null],
    ]);
  });

  it("глава писем никогда не открывается фото", () => {
    const b = layoutBundle({ chapters: ["a"], photos: [photo("p0", 0, { chapter: "a", opener: true }), photo("p1", 1)], letters: [{ id: "l1", authorName: "Мама", relation: "", text: "Письмо." }] });
    for (const r of [1, 2]) {
      const c = buildLayout(b, b.photos, r);
      expect(c.chapters.at(-1)).toMatchObject({ key: "__letters", photos: [] });
      expect(c.chapters.at(-1)!.openerPhoto).toBeUndefined();
    }
  });
});

describe("«без фото главы» (noOpenerPhoto) — решение для редактора, не вёрстка", () => {
  it("хранится только у строк глав и только как true", () => {
    expect(parseTocLines({ "c:a": { noOpenerPhoto: true }, "q:x": { noOpenerPhoto: true }, "c:b": { noOpenerPhoto: "да" } })).toEqual({ "c:a": { noOpenerPhoto: true } });
  });

  it("в содержимое книги не идёт: строка только с ним не делает оглавление своим, рядом с названием — убирается", () => {
    const b = layoutBundle({ chapters: ["a", "b"], photos: [] });
    const plain = JSON.stringify(buildLayout(b));
    expect(JSON.stringify(buildLayout({ ...b, book: { ...b.book, tocLines: { "c:a": { noOpenerPhoto: true } } } }))).toBe(plain);
    const titled = buildLayout({ ...b, book: { ...b.book, tocLines: { "c:a": { noOpenerPhoto: true, title: "Своя" } } } });
    expect(titled.tocLines).toEqual({ "c:a": { title: "Своя" } });
  });
});

describe("Photo: места __gallery и __off, фото начала главы", () => {
  const p = () => Photo.restore("p1", { bookId: "b1", position: 0, storageKey: "k", thumbKey: "t", width: 10, height: 10, caption: "", layout: "full", questionId: null, inline: null, crop: null, chapter: null, opener: false });

  it("служебные места принимаются, фото начала у них не бывает", () => {
    for (const key of [GALLERY_KEY, PHOTO_OFF_KEY, "__letters"]) {
      const x = p();
      x.update({ chapter: key, opener: true });
      expect(x.snapshot()).toMatchObject({ chapter: key, opener: false });
    }
  });

  it("фото начала главы — только у настоящей главы и не в ответе; уход в альбом снимает отметку, «без фото» оставляет главу", () => {
    const x = p();
    x.update({ chapter: "a", opener: true });
    expect(x.snapshot()).toMatchObject({ chapter: "a", opener: true });
    x.update({ opener: false });
    expect(x.snapshot()).toMatchObject({ chapter: "a", opener: false });
    x.update({ opener: true });
    x.update({ chapter: GALLERY_KEY });
    expect(x.snapshot()).toMatchObject({ chapter: GALLERY_KEY, opener: false });
  });

  it("одна правка переносит фото из ответа на начальную полосу главы", () => {
    const x = p();
    x.update({ questionId: "q1" });
    x.update({ opener: true });
    expect(x.snapshot()).toMatchObject({ questionId: "q1", chapter: null, opener: false });
    x.update({ questionId: null, chapter: "a", opener: true });
    expect(x.snapshot()).toMatchObject({ questionId: null, chapter: "a", opener: true });
  });
});

describe("выпуск 2: правила 2 включены", () => {
  it("новые книги — сразу на правилах 2, книга на правилах 1 переводится при правке мест фото, скрипт пишет", () => {
    expect(NEW_BOOK_LAYOUT_REV).toBe(2);
    expect(UPGRADE_ON_TOUCH).toBe(true);
    expect(LAYOUT_REV2_APPLY).toBe(true);
    expect(startBook().layoutRev).toBe(2);
  });
});

describe("перевод книги на правила 2 (planLayoutRev2)", () => {
  const signature = (b: LayoutBundle, rows = b.photos, r = b.book.layoutRev) => layoutSignature(buildLayout(b, rows, r));
  const expectSame = (b: LayoutBundle) => {
    const plan = planLayoutRev2(b, YEAR);
    if (!plan.ok) throw new Error(`план не найден: ${plan.reason}`);
    expect(signature(b, applyPins(b.photos, plan.changes), 2)).toBe(signature(b));
    return plan;
  };

  it("оформление с фото главы, фото без мест: план A отмечает снимки начальных полос, позиции не трогает", () => {
    const b = layoutBundle({ chapters: ["a", "b", "c"], photos: [0, 1, 2, 3, 4, 5].map((i) => photo(`p${i}`, i)) });
    const plan = expectSame(b);
    expect(plan.plan).toBe("A");
    expect(plan.changes.map((c) => [c.id, c.after])).toEqual([
      ["p0", { chapter: "a", opener: true, position: 0 }],
      ["p2", { chapter: "b", opener: true, position: 2 }],
      ["p4", { chapter: "c", opener: true, position: 4 }],
    ]);
  });

  it("оформление без фото главы и без снимков обложки внутри: перевод без единой правки фото", () => {
    const b = layoutBundle({ chapters: ["a", "b"], photos: [photo("p0", 0), photo("p1", 1, { questionId: "q-a" })], book: { interior: "classic", coverPhotoId: "p0" } });
    const plan = expectSame(b);
    expect(plan).toMatchObject({ plan: "A", changes: [] });
  });

  it("снимки обложки, которые прежние правила печатали сами, закрепляются; при сдвиге раскладки — план B с новыми позициями", () => {
    const b = layoutBundle({ chapters: ["a", "b"], photos: [0, 1, 2, 3, 4].map((i) => photo(`p${i}`, 4 - i)), book: { interior: "classic", coverPhotoExtra: ["p3"], backPhotoId: "p1" } });
    const plan = expectSame(b);
    expect(plan.plan).toBe("B");
    const after = applyPins(b.photos, plan.changes);
    expect(after.filter((r) => r.chapter).length).toBe(5);
    expect(after.map((r) => r.position).sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it("основное фото обложки у шаблона без фото: прежние правила его прятали — перевод закрепляет «не печатается»", () => {
    const b = layoutBundle({
      chapters: ["a", "b"],
      photos: [0, 1, 2, 3].map((i) => photo(`p${i}`, i)),
      book: { interior: "classic", coverTemplate: "linen", coverPhotoId: "p1", backLayout: "quote", backText: "" },
    });
    expect(rev(b, 1).chapters.map((c) => c.after)).toEqual([["p0", "p2"], ["p3"]]);
    for (const only of [["A"], ["B"]] as const) {
      const plan = planLayoutRev2(b, YEAR, only);
      if (!plan.ok) throw new Error(`план ${only[0]} не найден`);
      expect(applyPins(b.photos, plan.changes).find((r) => r.id === "p1"), only[0]).toMatchObject({ chapter: PHOTO_OFF_KEY, opener: false });
      expect(signature(b, applyPins(b.photos, plan.changes), 2)).toBe(signature(b));
    }
    // «Не печатать» фото вне историй: оно не напечатается и так — правок нет.
    expect(planLayoutRev2({ ...b, book: { ...b.book, photoPlacement: "none" } }, YEAR)).toMatchObject({ ok: true, plan: "A", changes: [] });
  });

  it("снимок начальной полосы отмечается, отметки влитой главы и устаревшие — снимаются", () => {
    const b = layoutBundle({
      chapters: ["a", "b"],
      photos: [photo("p0", 0, { chapter: "a" }), photo("p1", 1, { chapter: "b", opener: true }), photo("p2", 2, { chapter: "zz", opener: true })],
      book: { tocLines: { "c:b": { hidden: true } } },
    });
    const plan = expectSame(b);
    const after = applyPins(b.photos, plan.changes);
    expect(after.find((r) => r.id === "p0")).toMatchObject({ opener: true });
    expect(after.find((r) => r.id === "p1")).toMatchObject({ chapter: "b", opener: false });
    expect(after.find((r) => r.id === "p2")).toMatchObject({ opener: false });
  });

  describe("фото ждёт свою главу без текста — перевод его не трогает", () => {
    // Глава b есть в книге, но ещё не печатается (история без текста): фото, которому автор выбрал b, ждёт её.
    const waitingBook = (photos: ReturnType<typeof photo>[], book: Partial<LayoutBundle["book"]> = {}) =>
      layoutBundle({ chapters: ["a", "b"], questions: [layoutQuestion("q-a", "a", 0), layoutQuestion("q-b", "b", 1, "")], photos, book });

    it("план A не снимает с него отметку фото главы: глава и отметка остаются", () => {
      const b = waitingBook([photo("p0", 0), photo("p1", 1, { chapter: "b", opener: true })]);
      const plan = expectSame(b);
      expect(plan.plan).toBe("A");
      expect(plan.changes.map((c) => c.id)).toEqual(["p0"]);
    });

    it("прежние правила сделали его фото чужой главы — книга остаётся на правилах 1 (waitingChapter), а не переносит выбор автора", () => {
      const b = waitingBook([photo("p1", 0, { chapter: "b" })]);
      expect(rev(b, 1).chapters[0]).toMatchObject({ key: "a", opener: "p1" });
      expect(planLayoutRev2(b, YEAR)).toEqual({ ok: false, reason: "waitingChapter" });
    });

    it("план B не закрепляет его за главой, где оно сейчас стоит: если без этого вёрстка не та же — waitingChapter", () => {
      const b = waitingBook([photo("p1", 0, { chapter: "b" }), photo("p0", 1)], { interior: "classic" });
      expect(rev(b, 1).chapters[0].after).toEqual(["p1", "p0"]);
      expect(planLayoutRev2(b, YEAR, ["B"])).toEqual({ ok: false, reason: "waitingChapter" });
      // План A правок не требует — перевод идёт, место фото — то же, что выбрал автор.
      expect(expectSame(b)).toMatchObject({ plan: "A", changes: [] });
    });

    it("главы, которой в книге нет, фото не ждёт — устаревшую отметку перевод снимает (как раньше)", () => {
      const b = waitingBook([photo("p0", 0), photo("p1", 1, { chapter: "zz", opener: true })]);
      const plan = expectSame(b);
      expect(applyPins(b.photos, plan.changes).find((r) => r.id === "p1")).toMatchObject({ chapter: "zz", opener: false });
    });
  });

  it("снимок обложки в ответе: заказанная книга остаётся на правилах 1 с причиной для отчёта", () => {
    const questions = [layoutQuestion("q1", "a", 0, ""), layoutQuestion("q2", "a", 1)];
    const b = layoutBundle({ chapters: ["a"], questions, photos: [photo("p0", 0, { questionId: "q1" }), photo("p1", 1)], book: { coverPhotoId: "p0", status: "ordered" } });
    expect(planLayoutRev2(b, YEAR)).toEqual({ ok: false, reason: "coverInAnswer", coverInAnswer: { questionId: "q1", heading: "История q1" } });
    // У шаблона без фото основное фото обложки на ней не видно — причина та же.
    expect(planLayoutRev2({ ...b, book: { ...b.book, coverTemplate: "linen", backLayout: "quote", backText: "" } }, YEAR)).toMatchObject({ ok: false, reason: "coverInAnswer" });
  });

  it("снимок обложки в ответе у черновика: перевод с пометкой для отчёта — снимок печатается в ответе, остальное как было (редактор показывает его там, R9)", () => {
    const questions = [layoutQuestion("q1", "a", 0, ""), layoutQuestion("q2", "a", 1)];
    const b = layoutBundle({ chapters: ["a"], questions, photos: [photo("p0", 0, { questionId: "q1" }), photo("p1", 1)], book: { coverPhotoId: "p0" } });
    expect(b.book.status).toBe("draft");
    const plan = planLayoutRev2(b, YEAR);
    if (!plan.ok) throw new Error(`черновик не переведён: ${plan.reason}`);
    expect(plan.coverInAnswer).toEqual({ questionId: "q1", heading: "История q1" });
    const rows = applyPins(b.photos, plan.changes);
    // Снимок обложки остаётся в ответе и по правилам 2 там печатается; без него вёрстка — та же, что прежде.
    expect(rows.find((r) => r.id === "p0")).toMatchObject({ questionId: "q1" });
    const inAnswer = (r: number, list = rows) => buildLayout(b, list, r).chapters.flatMap((c) => c.items.flatMap((it) => (it.photos ?? []).map((p) => p.id)));
    expect(inAnswer(1, b.photos)).not.toContain("p0");
    expect(inAnswer(2)).toContain("p0");
    const hidden = rows.map((r) => (r.id === "p0" ? { ...r, questionId: null, chapter: PHOTO_OFF_KEY, opener: false } : r));
    expect(signature(b, hidden, 2)).toBe(signature(b));
    // Шаблон без фото на обложке — то же.
    expect(planLayoutRev2({ ...b, book: { ...b.book, coverTemplate: "linen", backLayout: "quote", backText: "" } }, YEAR)).toMatchObject({ ok: true, coverInAnswer: { questionId: "q1" } });
  });

  it("фото на всю страницу из ответа стоит только в ответе — перевод с ним точный, его место не трогается", () => {
    const inline = { width: 100, align: "center" as const, anchor: null, aspect: "original" as const, focusX: 0.5, focusY: 0.5, frame: "none" as const, page: true };
    const b = layoutBundle({
      chapters: ["a", "b"],
      photos: [photo("p0", 0), photo("p2", 1), photo("p1", 2, { questionId: "q-a", inline }), photo("p3", 3)],
      book: { interior: "classic", coverPhotoExtra: ["p3"] },
    });
    expect(rev(b, 1).chapters.map((c) => c.after)).toEqual([["p0", "p2"], ["p3"]]);
    const plan = expectSame(b);
    expect(plan.changes.find((c) => c.id === "p1")?.after ?? { chapter: null, opener: false }).toMatchObject({ chapter: null, opener: false });
  });
});

describe("LayoutRev2Service: запись, резервная копия, откат", () => {
  /** Хранилище в памяти: книги по id, запись — только места, позиции и версия. */
  function memStore(bundles: LayoutBundle[]) {
    const byId = new Map(bundles.map((b) => [b.book.id, structuredClone(b)]));
    const writes: string[] = [];
    const store: LayoutRevStore = {
      load: async (id) => (byId.has(id) ? structuredClone(byId.get(id)!) : null),
      writePins: async (id, pins: readonly ({ id: string } & PhotoPin)[]) => {
        writes.push(`pins:${id}`);
        const b = byId.get(id)!;
        b.photos = b.photos.map((p) => {
          const pin = pins.find((x) => x.id === p.id);
          return pin ? { ...p, chapter: pin.chapter, opener: pin.opener, position: pin.position } : p;
        });
      },
      setLayoutRev: async (id, from, to) => {
        const b = byId.get(id)!;
        if (b.book.layoutRev !== from) return false;
        writes.push(`rev:${id}:${to}`);
        b.book.layoutRev = to;
        return true;
      },
      pending: async (limit, after) => [...byId.values()].filter((b) => b.book.layoutRev === 1 && (!after || b.book.id > after)).map((b) => b.book.id).sort().slice(0, limit),
      reservedKeyCount: async () => 0,
    };
    return { store, byId, writes };
  }
  const book = (id: string, status: "draft" | "ordered" = "draft"): LayoutBundle => {
    const b = layoutBundle({ chapters: ["a", "b"], photos: [0, 1, 2, 3].map((i) => photo(`${id}-p${i}`, i)) });
    return { ...b, book: { ...b.book, id, status } };
  };

  it("перевод с записью закрыт (выключенный выпуск 2) — пробный проход и откат работают", async () => {
    const { store, byId, writes } = memStore([book("b1")]);
    // С выпуска 2 запись открыта по умолчанию; закрытая — как было в выпуске 1.
    expect(new LayoutRev2Service(store, new FakeUow()).applyOpen).toBe(true);
    const service = new LayoutRev2Service(store, new FakeUow(), false);
    expect(service.applyOpen).toBe(false);
    await expect(service.migrate("b1", { apply: true })).rejects.toThrow(/release 2/);
    expect(await service.migrate("b1", { apply: false })).toMatchObject({ applied: false, plan: { ok: true } });
    expect(writes).toEqual([]);
    expect(byId.get("b1")!.book.layoutRev).toBe(1);
  });

  it("пробный проход ничего не пишет; --apply — сначала резервная копия, потом места фото и версия; повтор — книга уже переведена", async () => {
    const { store, byId, writes } = memStore([book("b1")]);
    const service = new LayoutRev2Service(store, new FakeUow(), true);
    const dry = await service.migrate("b1", { apply: false });
    expect(dry).toMatchObject({ applied: false, plan: { ok: true, plan: "A" } });
    expect(writes).toEqual([]);
    const backup = vi.fn(() => expect(writes).toEqual([]));
    const done = await service.migrate("b1", { apply: true, backup });
    expect(done).toMatchObject({ applied: true });
    expect(backup).toHaveBeenCalledWith({ id: "b1", layoutRev: 1, photos: expect.arrayContaining([expect.objectContaining({ id: "b1-p0", before: { chapter: null, opener: false, position: 0 } })]) });
    expect(writes).toEqual(["pins:b1", "rev:b1:2"]);
    expect(byId.get("b1")!.book.layoutRev).toBe(2);
    expect(await service.migrate("b1", { apply: true })).toEqual({ bookId: "b1", skipped: "done" });
    expect(await service.pending(10)).toEqual([]);
  });

  it("откат из копии: только если фото с перевода не меняли (или force); пробный — без записи", async () => {
    const { store, byId } = memStore([book("b1")]);
    const service = new LayoutRev2Service(store, new FakeUow(), true);
    const saved: Parameters<LayoutRev2Service["restore"]>[0][] = [];
    await service.migrate("b1", { apply: true, backup: (rows) => void saved.push(rows) });
    expect(await service.restore(saved[0], { apply: false })).toBe("restored");
    expect(byId.get("b1")!.book.layoutRev).toBe(2);
    byId.get("b1")!.photos[0].position = 9;
    expect(await service.restore(saved[0], { apply: true })).toBe("changed");
    byId.get("b1")!.photos[0].position = 0;
    expect(await service.restore(saved[0], { apply: true })).toBe("restored");
    expect(byId.get("b1")!.book.layoutRev).toBe(1);
    expect(byId.get("b1")!.photos.map((p) => [p.chapter, p.opener])).toEqual(book("b1").photos.map((p) => [p.chapter, p.opener]));
    expect(await service.restore(saved[0], { apply: true })).toBe("notMigrated");
  });

  it("откат книги, у которой перевод не менял фото: если её правили и по прежним правилам она напечаталась бы иначе — только с force", async () => {
    // Оформление без фото главы: перевод без единой правки фото — в копии пусто.
    const plain = layoutBundle({ chapters: ["a", "b"], photos: [0, 1, 2].map((i) => photo(`b1-p${i}`, i)), book: { interior: "classic" } });
    const { store, byId } = memStore([plain]);
    const service = new LayoutRev2Service(store, new FakeUow(), true);
    const saved: Parameters<LayoutRev2Service["restore"]>[0][] = [];
    await service.migrate("b1", { apply: true, backup: (rows) => void saved.push(rows) });
    expect(saved[0].photos).toEqual([]);
    // На правилах 2 автор выбрал снимок оборота: внутри его больше нет, а прежние правила напечатали бы его снова.
    Object.assign(byId.get("b1")!.book, { backPhotoId: "b1-p1" });
    expect(await service.restore(saved[0], { apply: true })).toBe("changed");
    expect(byId.get("b1")!.book.layoutRev).toBe(2);
    expect(await service.restore(saved[0], { apply: true, force: true })).toBe("restored");
    expect(byId.get("b1")!.book.layoutRev).toBe(1);
  });

  it("перевод при правке: сборка упала на данных книги — в лог, книга остаётся на правилах 1, правка идёт по ним", async () => {
    const { store, byId } = memStore([book("b1")]);
    // Вопросы, на которых сборка книги падает (данные из базы разошлись с ожиданием).
    byId.get("b1")!.questions = null as unknown as LayoutBundle["questions"];
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await new LayoutRev2Service(store, new FakeUow()).upgradeInPlace("b1")).toBe(false);
      expect(byId.get("b1")!.book.layoutRev).toBe(1);
      expect(log).toHaveBeenCalledWith("[layout-rev2] upgrade planning failed", "b1", expect.any(Error));
    } finally {
      log.mockRestore();
    }
  });

  it("перевод при правке — только черновик и только точный план", async () => {
    const { store, byId } = memStore([book("b1"), book("b2", "ordered")]);
    const service = new LayoutRev2Service(store, new FakeUow());
    expect(await service.upgradeInPlace("b2")).toBe(false);
    expect(byId.get("b2")!.book.layoutRev).toBe(1);
    expect(await service.upgradeInPlace("b1")).toBe(true);
    expect(byId.get("b1")!.book.layoutRev).toBe(2);
  });
});

describe("PhotosService.batch и перевод при правке", () => {
  const setup = (opts: { onTouch?: boolean; status?: "draft" | "ordered" } = {}) => {
    const books = new MemBooks();
    // Книга на правилах 1 (новые с выпуска 2 — сразу на 2): перевод при правке задевает только такие.
    const b = Book.restore("b1", { ...startBook().snapshot(), layoutRev: 1 });
    books.rows.set("b1", opts.status === "ordered" ? Book.restore("b1", { ...b.snapshot(), status: "ordered" }) : b);
    const photos = new MemPhotos();
    for (const id of ["p1", "p2", "p3"]) photos.rows.push(Photo.uploaded(id, { bookId: "b1", position: photos.rows.length, storageKey: id, thumbKey: id, width: 10, height: 10 }));
    const upgrade = vi.fn(async () => true);
    const uow = new FakeUow();
    const run = vi.spyOn(uow, "run");
    const service = new PhotosService(books, photos, noQuestions, images, new MemFiles(), ids, uow, { onTouch: !!opts.onTouch, upgrade });
    return { service, photos, upgrade, run, books };
  };
  const snap = (photos: MemPhotos, id: string) => photos.rows.find((p) => p.id === id)!.snapshot();

  it("правки по правилам Photo.update одной транзакцией; фото начала у главы одно", async () => {
    const { service, photos, run } = setup();
    await service.batch("b1", owner, [
      { id: "p1", patch: { chapter: "a", opener: true } },
      { id: "p2", patch: { chapter: GALLERY_KEY, opener: true } },
      { id: "p3", patch: { chapter: "a", opener: true } },
    ]);
    expect(run).toHaveBeenCalledTimes(1);
    expect([snap(photos, "p1"), snap(photos, "p2"), snap(photos, "p3")].map((s) => [s.chapter, s.opener])).toEqual([
      ["a", false],
      [GALLERY_KEY, false],
      ["a", true],
    ]);
  });

  it("чужая и заказанная книга — отказ; неизвестное фото — отказ всей пачки", async () => {
    await rejectsWith(setup().service.batch("b1", stranger, [{ id: "p1", patch: { caption: "x" } }]), "bookNotFound");
    await rejectsWith(setup({ status: "ordered" }).service.batch("b1", owner, [{ id: "p1", patch: { caption: "x" } }]), "bookLocked");
    await rejectsWith(setup().service.batch("b1", owner, [{ id: "nope", patch: { caption: "x" } }]), "photoNotFound");
  });

  it("выпуск 1: перевод при правке выключен — ни пакет, ни одиночная правка книгу не переводят", async () => {
    const { service, upgrade } = setup();
    await service.batch("b1", owner, [{ id: "p1", patch: { chapter: "a" } }]);
    await service.update("b1", owner, "p2", { opener: true });
    expect(upgrade).not.toHaveBeenCalled();
  });

  it("правка одного фото — транзакцией под блокировкой книги: снимок фото, прочитанный до перевода, не затрёт его места", async () => {
    for (const onTouch of [false, true]) {
      const { service, run, books, upgrade } = setup({ onTouch });
      await service.update("b1", owner, "p1", { caption: "Подпись" });
      expect(run).toHaveBeenCalledTimes(1);
      expect(books.locks).toBe(1);
      expect(upgrade).not.toHaveBeenCalled();
    }
  });

  it("выпуск 2: правка места и любой пакет переводят книгу до правки; подпись и кадр одного фото — нет", async () => {
    const { service, upgrade, run } = setup({ onTouch: true });
    await service.update("b1", owner, "p1", { caption: "Подпись", crop: { x: 0.5, y: 0.5, zoom: 1 } });
    expect(upgrade).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(1);
    await service.update("b1", owner, "p1", { chapter: "a" });
    expect(upgrade).toHaveBeenCalledWith("b1");
    expect(run).toHaveBeenCalledTimes(2);
    await service.batch("b1", owner, [
      { id: "p2", patch: { caption: "Пачкой" } },
      { id: "p3", patch: { layout: "grid" } },
    ]);
    expect(upgrade).toHaveBeenCalledTimes(2);
  });

  it("явный перевод перед первой правкой мест (POST …/layout): под блокировкой книги, права — как у правки фото", async () => {
    const { service, upgrade, run, books } = setup({ onTouch: true });
    expect(await service.upgradeLayout("b1", owner)).toBe(2);
    expect(upgrade).toHaveBeenCalledWith("b1");
    expect([run.mock.calls.length, books.locks]).toEqual([1, 1]);
    // Перевод не повторил вёрстку — версия прежняя: правка пойдёт по правилам 1.
    upgrade.mockResolvedValueOnce(false);
    expect(await service.upgradeLayout("b1", owner)).toBe(1);
    // Книга уже на правилах 2 — переводить нечего.
    books.rows.set("b1", Book.restore("b1", { ...books.rows.get("b1")!.snapshot(), layoutRev: 2 }));
    upgrade.mockClear();
    expect(await service.upgradeLayout("b1", owner)).toBe(2);
    expect(upgrade).not.toHaveBeenCalled();
    await rejectsWith(setup({ onTouch: true }).service.upgradeLayout("b1", stranger), "bookNotFound");
    await rejectsWith(setup({ onTouch: true, status: "ordered" }).service.upgradeLayout("b1", owner), "bookLocked");
    // Выпуск 2 выключен — книга не переводится.
    const off = setup();
    expect(await off.service.upgradeLayout("b1", owner)).toBe(1);
    expect(off.upgrade).not.toHaveBeenCalled();
  });

  it("выпуск 2: смена оформления переводит книгу; та же или без оформления — нет", async () => {
    const books = new MemBooks();
    books.rows.set("b1", Book.restore("b1", { ...startBook().snapshot(), layoutRev: 1 }));
    const upgrade = vi.fn(async () => true);
    const service = new BooksService(books, noQuestions, themes, { bookHasOrders: async () => false }, new MemFiles(), ids, new FakeUow(), { now: () => new Date() }, noChapters, { onTouch: true, upgrade });
    await service.updateSettings("b1", owner, { title: "Новое" }, new MemPhotos());
    await service.updateSettings("b1", owner, { interior: "classic" }, new MemPhotos());
    expect(upgrade).not.toHaveBeenCalled();
    await service.updateSettings("b1", owner, { interior: "luna" }, new MemPhotos());
    expect(upgrade).toHaveBeenCalledWith("b1");
  });
});

describe("аргументы скрипта photos:layout-rev2", () => {
  const id = "0b6f4c2e-3a1d-4e5f-8a9b-1c2d3e4f5a6b";

  it("значение — через «=» или пробел; откат — с --force и --apply", () => {
    expect(parseLayoutRev2Args([])).toEqual({ mode: "migrate", apply: false, book: null, limit: Infinity });
    expect(parseLayoutRev2Args(["--book", id, "--apply"])).toEqual({ mode: "migrate", apply: true, book: id, limit: Infinity });
    expect(parseLayoutRev2Args([`--book=${id}`, "--limit=5"])).toEqual({ mode: "migrate", apply: false, book: id, limit: 5 });
    expect(parseLayoutRev2Args(["--restore", "/backups/x.json", "--apply"])).toEqual({ mode: "restore", apply: true, force: false, file: "/backups/x.json" });
    expect(parseLayoutRev2Args(["--restore=/backups/x.json", "--force"])).toEqual({ mode: "restore", apply: false, force: true, file: "/backups/x.json" });
  });

  it("неизвестный, пустой или лишний аргумент — ошибка, а не перевод всех книг", () => {
    for (const argv of [
      ["--restore=", "--apply"],
      ["--restore"],
      ["--book=", "--apply"],
      ["--book", "--apply"],
      ["--book=abc"],
      ["--limit=0"],
      ["--limit=ten"],
      ["--aply"],
      ["--apply", id],
      ["--restore=x.json", `--book=${id}`],
      ["--force"],
    ])
      expect(parseLayoutRev2Args(argv), argv.join(" ")).toHaveProperty("error");
  });
});
