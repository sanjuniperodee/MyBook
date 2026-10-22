import type { UnitOfWork } from "@/shared/application";
import { LAYOUT_REV2_APPLY } from "../domain/layout-rev";
import { buildBookContent } from "@/lib/book/book-content";
import { withCoverPhotos, type CoverSettings } from "@/lib/book/cover-photos";
import { getInteriorDesign } from "@/lib/book/interiors";
import { layoutSignature } from "@/lib/book/layout-signature";
import { coverAndBackPhotoIds, LAYOUT_REV_2, PHOTO_OFF_KEY, printableText, questionHeading, toPhotoItem, type BookContent, type BookLike, type ChapterLike, type ContentChapter, type LetterLike, type QuestionLike } from "@/lib/book/layout";
import { GALLERY_KEY } from "@/lib/book/toc";

/**
 * Перевод книги на правила раскладки фото 2 (books.layout_rev, lib/book/layout.ts) так, чтобы напечатанное не
 * изменилось: места, которые прежние правила давали фото сами, закрепляются за ними явно (photos.chapter, opener,
 * position), и сборка по правилам 2 обязана дать ту же подпись вёрстки (layout-signature.ts), что и прежняя.
 * Общий для скрипта npm run photos:layout-rev2 и перевода при правке (выпуск 2, UPGRADE_ON_TOUCH).
 *
 * План A — минимум правок: в оформлениях с фото главы отметить снимки начальных полос и снять отметки, которые прежние
 * правила не брали; снимки обложки и оборота (кроме основного), напечатанные внутри сами, закрепить там, где стоят.
 * План B — точный по построению: каждое фото вне ответов закрепить на его месте и перенумеровать позиции в порядке
 * печати (главы: фото начала, фото после главы; альбом; фото в ответах; остальные), — фото по правилу книги не остаётся.
 * В обоих основное фото обложки, которого на ней не видно (шаблон без фото), — «не печатается»: прежние правила прячут
 * его и тогда, а правила 2 поставили бы внутрь.
 * Известный остаток — снимок обложки в ответе (прежние правила его там прячут, правила 2 печатают): книга, черновик
 * тоже, остаётся на правилах 1 и попадает в отчёт — редактор этот снимок в ответе не показывает (editor-data.ts), и
 * автор не увидел бы, что он теперь напечатается.
 */

/** Фото книги для перевода: строка photos (то, что идёт в сборку, и место). */
export type LayoutPhoto = Parameters<typeof toPhotoItem>[0] & { position: number; chapter: string | null; opener: boolean };

/** Книга со всем, что идёт в сборку, — как contentFor у PDF: вопросы, главы своей книги, фото, одобренные письма. */
export interface LayoutBundle {
  /** Строка книги: с шаблоном обложки и оборотом — по ним видно, какие снимки обложка печатает (cover-photos.ts). */
  book: BookLike & Partial<CoverSettings> & { id: string; status: "draft" | "ordered"; layoutRev: number };
  questions: QuestionLike[];
  chapters: ChapterLike[];
  photos: LayoutPhoto[];
  letters: LetterLike[];
}

/** Место и позиция фото. */
export interface PhotoPin {
  chapter: string | null;
  opener: boolean;
  position: number;
}

/** Фото, у которого перевод меняет место или позицию: прежние значения и новые. */
export interface PhotoPinChange {
  id: string;
  before: PhotoPin;
  after: PhotoPin;
}

export type LayoutRev2Plan =
  | {
      ok: true;
      plan: "A" | "B";
      changes: PhotoPinChange[];
    }
  | {
      ok: false;
      /** coverInAnswer — снимок обложки в ответе: по правилам 2 он там напечатается; mismatch — любое другое расхождение. */
      reason: "coverInAnswer" | "mismatch";
      /** Ответ со снимком обложки — заголовок для отчёта. */
      coverInAnswer?: { questionId: string; heading: string };
    };

const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;

/** Ключи глав, которые печатаются в главе-хозяине: она сама и убранные автором (их истории — в ней). */
const keysOf = (ch: ContentChapter) => new Set([ch.key, ...(ch.folded ?? []).map((f) => f.key)]);

/** Фото в ответах: в тексте и на всю страницу (photoBefore). */
const answerPhotoIds = (c: BookContent) => new Set(c.chapters.flatMap((ch) => ch.items.flatMap((it) => [...(it.photos ?? []), ...(it.photoBefore ? [it.photoBefore] : [])].map((p) => p.id))));

/** Все напечатанные фото: в ответах, фото начала и после глав, альбом. */
const printedPhotoIds = (c: BookContent) =>
  new Set([...answerPhotoIds(c), ...c.chapters.flatMap((ch) => [...(ch.openerPhoto ? [ch.openerPhoto.id] : []), ...ch.photos.map((p) => p.id)]), ...c.galleryPhotos.map((p) => p.id)]);

/** Сборка книги по строкам фото (по позициям) и правилам layoutRev; year — один на обе сборки (в содержимом есть год). */
const buildRows = (b: LayoutBundle, rows: readonly LayoutPhoto[], layoutRev: number, year: number) =>
  buildBookContent({ ...b.book, layoutRev }, b.questions, [...rows].sort(byPosition).map(toPhotoItem), b.chapters, year, b.letters);

/**
 * План перевода книги на правила 2 — чистая функция, ничего не пишет. year — один на обе сборки (в содержимом есть год);
 * only — какие планы пробовать (по умолчанию A, потом B; тест проверяет и B отдельно).
 */
export function planLayoutRev2(b: LayoutBundle, year = new Date().getFullYear(), only: readonly ("A" | "B")[] = ["A", "B"]): LayoutRev2Plan {
  const build = (rows: readonly LayoutPhoto[], layoutRev: number) => buildRows(b, rows, layoutRev, year);
  const v1 = build(b.photos, 1);
  const before = layoutSignature(v1);
  const photoDesign = !!getInteriorDesign(b.book.interior).opener.photo;
  const row = new Map(b.photos.map((p) => [p.id, p]));
  const inAnswers = answerPhotoIds(v1);
  // Фото вне ответов, напечатанное в главе: глава, выбранная автором, если она печатается в этой главе, иначе сама глава.
  const pinTo = (ch: ContentChapter, id: string) => {
    const r = row.get(id)!;
    return r.chapter && keysOf(ch).has(r.chapter) ? r.chapter : ch.key;
  };
  const openers = v1.chapters.flatMap((ch) => (ch.openerPhoto ? [{ ch, id: ch.openerPhoto.id }] : []));
  const openerIds = new Set(openers.map((o) => o.id));
  // Снимки, которые обложка и оборот печатают на самом деле (шаблон, вариант оборота): правила 2 сами внутрь их не ставят.
  const onCover = coverAndBackPhotoIds(withCoverPhotos(b.book, b.photos.map((p) => p.id)));
  // Основное фото обложки, которого на ней не видно: прежние правила прятали его и так, правила 2 поставили бы внутрь
  // как фото без места — закрепить «не печатается» (если прежде оно не печаталось и «не печатать» его не убрало бы).
  const cover = b.book.coverPhotoId ? row.get(b.book.coverPhotoId) : undefined;
  const offCover =
    cover && !onCover.has(cover.id) && !cover.questionId && cover.chapter !== PHOTO_OFF_KEY && !printedPhotoIds(v1).has(cover.id) && b.book.photoPlacement !== "none" ? cover.id : null;
  const off = { chapter: PHOTO_OFF_KEY, opener: false };

  // ─── план A ───
  const a = new Map<string, Partial<PhotoPin>>();
  if (photoDesign) {
    for (const { ch, id } of openers) if (!row.get(id)!.questionId) a.set(id, { chapter: pinTo(ch, id), opener: true });
    // Отметки, которые прежние правила не взяли (снимок влитой главы, устаревшие), правила 2 взяли бы — снимаем.
    for (const r of b.photos) if (r.opener && !r.questionId && !openerIds.has(r.id)) a.set(r.id, { opener: false });
  }
  // Снимки обложки и оборота, кроме основного: правила 2 сами внутрь их не ставят — закрепить там, где они напечатаны.
  const extras = new Set(onCover);
  if (b.book.coverPhotoId) extras.delete(b.book.coverPhotoId);
  if (offCover) a.set(offCover, off);
  for (const ch of v1.chapters)
    for (const p of ch.photos) {
      const r = row.get(p.id)!;
      if (extras.has(p.id) && !r.questionId && !(r.chapter && keysOf(ch).has(r.chapter))) a.set(p.id, { chapter: ch.key, opener: false });
    }
  for (const p of v1.galleryPhotos) if (extras.has(p.id) && !row.get(p.id)!.questionId && row.get(p.id)!.chapter !== GALLERY_KEY) a.set(p.id, { chapter: GALLERY_KEY, opener: false });
  const planA = b.photos.map((r) => ({ ...r, ...a.get(r.id) }));

  // ─── план B ───
  const pins = new Map<string, Omit<PhotoPin, "position">>();
  for (const ch of v1.chapters) {
    if (ch.openerPhoto && !row.get(ch.openerPhoto.id)!.questionId) pins.set(ch.openerPhoto.id, { chapter: pinTo(ch, ch.openerPhoto.id), opener: true });
    for (const p of ch.photos) {
      const r = row.get(p.id)!;
      if (r.questionId) continue;
      const chapter = pinTo(ch, p.id);
      // В оформлении без фото главы отметка ничего не меняет и остаётся (вернётся при смене оформления), если глава та же.
      pins.set(p.id, { chapter, opener: !photoDesign && r.opener && chapter === r.chapter });
    }
  }
  for (const p of v1.galleryPhotos) if (!row.get(p.id)!.questionId) pins.set(p.id, { chapter: GALLERY_KEY, opener: false });
  if (offCover) pins.set(offCover, off);
  const old = [...b.photos].sort(byPosition);
  const order = [...pins.keys(), ...old.filter((r) => !pins.has(r.id) && inAnswers.has(r.id)).map((r) => r.id), ...old.filter((r) => !pins.has(r.id) && !inAnswers.has(r.id)).map((r) => r.id)];
  const position = new Map(order.map((id, i) => [id, i]));
  const planB = b.photos.map((r) => ({ ...r, ...pins.get(r.id), position: position.get(r.id)! }));

  const changes = (rows: readonly LayoutPhoto[]): PhotoPinChange[] =>
    rows.flatMap((r) => {
      const was = row.get(r.id)!;
      const pin = (p: LayoutPhoto): PhotoPin => ({ chapter: p.chapter, opener: p.opener, position: p.position });
      return was.chapter === r.chapter && was.opener === r.opener && was.position === r.position ? [] : [{ id: r.id, before: pin(was), after: pin(r) }];
    });
  const plans = (
    [
      ["A", planA],
      ["B", planB],
    ] as const
  ).filter(([plan]) => only.includes(plan));
  for (const [plan, rows] of plans) if (layoutSignature(build(rows, LAYOUT_REV_2)) === before) return { ok: true, plan, changes: changes(rows) };

  // Снимок обложки в ответе: прежние правила его прячут, правила 2 печатают. Если, кроме него, всё совпадает, — своя
  // причина в отчёте. Книга остаётся на правилах 1, черновик тоже: редактор снимок обложки в ответе не показывает
  // (editor-data.ts), и автор не узнал бы, что он теперь напечатается. Когда редактор начнёт его показывать (R9),
  // черновики можно будет переводить с пометкой в отчёте.
  const question = cover?.questionId ? b.questions.find((q) => q.id === cover.questionId) : undefined;
  if (cover && question) {
    const hidden = (rows: readonly LayoutPhoto[]) => rows.map((r) => (r.id === cover.id ? { ...r, questionId: null, chapter: PHOTO_OFF_KEY, opener: false } : r));
    if (plans.some(([, rows]) => layoutSignature(build(hidden(rows), LAYOUT_REV_2)) === before))
      return { ok: false, reason: "coverInAnswer", coverInAnswer: { questionId: question.id, heading: printableText(questionHeading(question, b.book)) } };
  }
  return { ok: false, reason: "mismatch" };
}

/** Прежние значения строк книги до перевода — для отката (скрипт сохраняет их на диск до записи). */
export interface LayoutRevBackupBook {
  id: string;
  layoutRev: number;
  photos: PhotoPinChange[];
}

/** Перевод одной книги: итог для отчёта скрипта. */
export type LayoutRev2Result = { bookId: string; title: string; status: "draft" | "ordered"; plan: LayoutRev2Plan; applied: boolean } | { bookId: string; skipped: "missing" | "done" };

/** Хранилище перевода: книга под блокировкой и запись прямым SQL — без updated_at книги и фото (по нему отчёты). */
export interface LayoutRevStore {
  /** Книга со всем для сборки (как contentFor); lock — строки книги и её фото заблокированы до конца транзакции. */
  load(bookId: string, opts: { lock: boolean }): Promise<LayoutBundle | null>;
  /** Места и позиции фото книги. */
  writePins(bookId: string, pins: readonly ({ id: string } & PhotoPin)[]): Promise<void>;
  /** Версия правил книги from → to; false — у книги уже не from. */
  setLayoutRev(bookId: string, from: number, to: number): Promise<boolean>;
  /** Книги на правилах 1 по порядку id, после afterId. */
  pending(limit: number, afterId: string | null): Promise<string[]>;
  /**
   * Сколько фото книг на правилах 1 стоят на служебных ключах мест (альбом, «не печатается»): до выпуска 2 — 0 (их ставит
   * только интерфейс выпуска 2), потом — выбор авторов. Правила 1 и перевод их учитывают — это строка отчёта, не запрет.
   */
  reservedKeyCount(): Promise<number>;
}

/** Перевод книги на правила 2 при правке мест фото (выпуск 2: UPGRADE_ON_TOUCH, domain/layout-rev.ts). */
export interface LayoutUpgrade {
  readonly onTouch: boolean;
  /** Внутри транзакции правки (строка книги заблокирована): true — книга теперь на правилах 2. */
  upgrade(bookId: string): Promise<boolean>;
}

/** Перевод книг на правила раскладки фото 2: скрипт (по книге, своей транзакцией) и перевод при правке. */
export class LayoutRev2Service {
  constructor(
    private readonly store: LayoutRevStore,
    private readonly uow: UnitOfWork,
    /** Перевод скриптом с записью разрешён (выпуск 2, domain/layout-rev.ts); пробный проход и откат — всегда. */
    readonly applyOpen: boolean = LAYOUT_REV2_APPLY,
  ) {}

  pending(limit: number, afterId: string | null = null) {
    return this.store.pending(limit, afterId);
  }

  reservedKeyCount() {
    return this.store.reservedKeyCount();
  }

  /**
   * Одна книга на правилах 1: план; apply — запись одной транзакцией под блокировкой строк книги и фото. backup получает
   * прежние значения до записи — если он упал, транзакция откатывается и книга остаётся как была.
   */
  migrate(bookId: string, opts: { apply: boolean; backup?: (rows: LayoutRevBackupBook) => void | Promise<void> }): Promise<LayoutRev2Result> {
    if (opts.apply && !this.applyOpen) return Promise.reject(new Error("layout-rev2: --apply is closed until release 2 (domain/layout-rev.ts)"));
    return this.uow.run(async () => {
      const bundle = await this.store.load(bookId, { lock: opts.apply });
      if (!bundle) return { bookId, skipped: "missing" as const };
      if (bundle.book.layoutRev === LAYOUT_REV_2) return { bookId, skipped: "done" as const };
      const plan = planLayoutRev2(bundle);
      const done = { bookId, title: bundle.book.title, status: bundle.book.status, plan };
      if (!opts.apply || !plan.ok) return { ...done, applied: false };
      await opts.backup?.({ id: bookId, layoutRev: bundle.book.layoutRev, photos: plan.changes });
      await this.write(bookId, bundle.book.layoutRev, plan.changes);
      return { ...done, applied: true };
    });
  }

  /** Перевод при правке (выпуск 2): внутри уже открытой транзакции, только черновик и только точный план. */
  upgradeInPlace(bookId: string): Promise<boolean> {
    return this.uow.run(async () => {
      const bundle = await this.store.load(bookId, { lock: true });
      if (!bundle || bundle.book.layoutRev === LAYOUT_REV_2 || bundle.book.status !== "draft") return false;
      const plan = planLayoutRev2(bundle);
      if (!plan.ok) return false;
      await this.write(bookId, bundle.book.layoutRev, plan.changes);
      return true;
    });
  }

  /**
   * Откат книги из резервной копии: только если с перевода её фото не меняли (места и позиции — те, что записал
   * перевод) и по прежним правилам с прежними местами она напечатается так же, как сейчас, — или force; apply = false —
   * только проверить. «restored» — откатилась (или откатится).
   */
  restore(saved: LayoutRevBackupBook, opts: { apply: boolean; force?: boolean }): Promise<"restored" | "changed" | "missing" | "notMigrated"> {
    return this.uow.run(async () => {
      const bundle = await this.store.load(saved.id, { lock: opts.apply });
      if (!bundle) return "missing";
      if (bundle.book.layoutRev !== LAYOUT_REV_2) return "notMigrated";
      const now = new Map(bundle.photos.map((p) => [p.id, p]));
      const untouched = saved.photos.every((c) => {
        const p = now.get(c.id);
        return !p || (p.chapter === c.after.chapter && p.opener === c.after.opener && p.position === c.after.position);
      });
      // Книгу могли править на правилах 2 и не трогая этих фото (у 37 из 38 книг перевод фото не менял): новые фото,
      // снимок оборота, «без фото главы». Откат без force — только если напечатанное от него не изменится.
      const year = new Date().getFullYear();
      const before = bundle.photos.map((p) => {
        const c = saved.photos.find((x) => x.id === p.id);
        return c ? { ...p, ...c.before } : p;
      });
      const same = layoutSignature(buildRows(bundle, before, saved.layoutRev, year)) === layoutSignature(buildRows(bundle, bundle.photos, LAYOUT_REV_2, year));
      if (!(untouched && same) && !opts.force) return "changed";
      if (!opts.apply) return "restored";
      await this.store.writePins(
        saved.id,
        saved.photos.filter((c) => now.has(c.id)).map((c) => ({ id: c.id, ...c.before })),
      );
      await this.store.setLayoutRev(saved.id, LAYOUT_REV_2, saved.layoutRev);
      return "restored";
    });
  }

  private async write(bookId: string, from: number, changes: readonly PhotoPinChange[]) {
    if (changes.length) await this.store.writePins(bookId, changes.map((c) => ({ id: c.id, ...c.after })));
    // Книгу заблокировали при загрузке — другой версии тут быть не может; иначе откатываем всё.
    if (!(await this.store.setLayoutRev(bookId, from, LAYOUT_REV_2))) throw new Error(`layout-rev2: book ${bookId} is no longer on rev ${from}`);
  }
}
