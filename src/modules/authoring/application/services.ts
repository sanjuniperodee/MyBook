import type { Clock, UnitOfWork } from "@/shared/application";
import type { Locale } from "@/i18n/config";
import { CHAPTER_EPIGRAPH_MAX, CHAPTER_TITLE_MAX, hasOutline, MAX_CHAPTERS, progressChanged, SECTION_PROMPT_MAX, SECTION_TITLE_MAX } from "@/lib/content/kinds";
import { LAYOUT_REV_2 } from "@/lib/book/layout";
import {
  AuthoringError,
  Book,
  insertKey,
  Letter,
  MAX_LETTERS,
  MAX_PHOTOS,
  MAX_QUESTIONS,
  Photo,
  sameSet,
  type BookRepository,
  type BookSettings,
  type BookViewer,
  type ChapterRepository,
  type LetterRepository,
  type LetterStatus,
  type Outline,
  type PhotoProps,
  type PhotoRepository,
  type QuestionPatch,
  type QuestionRepository,
  type StartInput,
} from "../domain";
import type { FileStore, IdGenerator, ImageProcessor, OrdersLookup, ThemeCatalog } from "./ports";
import type { LayoutUpgrade } from "./layout-rev2";

/**
 * Загрузка книги с проверкой доступа: чужая книга (для правки — и книга, которую сотруднику менять нельзя) — как будто её нет.
 * lock — строка книги заблокирована до конца транзакции (только внутри uow.run): проверки лимитов и набора и запись
 * идут без гонок с параллельной правкой и с заказом (lockForOrder ждёт).
 */
async function loadBook(books: BookRepository, bookId: string, viewer: BookViewer, opts: { editable?: boolean; lock?: boolean } = {}) {
  const book = await books.findById(bookId, opts.lock ? { lock: true } : undefined);
  if (!book || !(opts.editable ? book.isEditableBy(viewer) : book.isVisibleTo(viewer))) throw new AuthoringError("bookNotFound");
  if (opts.editable) book.assertEditable();
  return book;
}

export class BooksService {
  constructor(
    private readonly books: BookRepository,
    private readonly questions: QuestionRepository,
    private readonly themes: ThemeCatalog,
    private readonly orders: OrdersLookup,
    private readonly files: FileStore,
    private readonly ids: IdGenerator,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly chapters: ChapterRepository,
    /** Перевод на правила раскладки фото 2 при смене оформления (выпуск 2); нет — не переводить. */
    private readonly layout?: LayoutUpgrade,
  ) {}

  /** Новая книга. Тема проверяется: незнакомая — unknownTheme (молчаливый откат на «любимому» — только для показа). */
  async start(userId: string, input: Omit<StartInput, "userId"> & { theme: string }) {
    if (!this.themes.isTheme(input.theme)) throw new AuthoringError("unknownTheme");
    const theme = this.themes.get(input.theme, input.language);
    const { book, questions, chapters } = Book.start(this.books.nextId(), { userId, ...input }, theme, this.clock.now(), () => this.ids.uuid());
    await this.uow.run(async () => {
      await this.books.add(book, questions, chapters);
      this.uow.track(book);
    });
    return book;
  }

  /** Настройки из редактора (включая смену языка книги). */
  async updateSettings(
    bookId: string,
    viewer: BookViewer,
    patch: BookSettings & { language?: Locale; coverPhotoId?: string | null; backPhotoId?: string | null; coverPhotoExtra?: string[]; backPhotoExtra?: string[]; photoFrames?: unknown; tocLines?: unknown; interiorStyle?: unknown; coverDesign?: unknown },
    photos: PhotoRepository,
  ) {
    return this.uow.run(async () => {
      // Блокировка: save пишет снимок книги целиком (и статус) — заказ, оформленный посреди правки, не откатится в черновик.
      const book = await loadBook(this.books, bookId, viewer, { editable: true, lock: true });
      const { language, coverPhotoId, backPhotoId, coverPhotoExtra, backPhotoExtra, photoFrames, tocLines, interiorStyle, coverDesign, ...settings } = patch;
      // Смена оформления на книге с прежними правилами раскладки фото — сначала перевод на правила 2 (выпуск 2), по
      // книге как она есть в базе, до остальных правок этого запроса.
      if (this.layout?.onTouch && settings.interior !== undefined && settings.interior !== book.interior && book.layoutRev !== LAYOUT_REV_2) await this.layout.upgrade(book.id);
      for (const [side, ids] of [
        ["cover", coverPhotoExtra],
        ["back", backPhotoExtra],
      ] as const) {
        if (ids === undefined) continue;
        if (ids.length && !(await photos.belongToBook(book.id, [...new Set(ids)]))) throw new AuthoringError("photoNotFound");
        book.setExtraPhotos(side, ids);
      }
      if (coverPhotoId !== undefined) {
        if (coverPhotoId && !(await photos.findInBook(book.id, coverPhotoId))) throw new AuthoringError("photoNotFound");
        book.setCoverPhoto(coverPhotoId);
      }
      if (backPhotoId !== undefined) {
        if (backPhotoId && !(await photos.findInBook(book.id, backPhotoId))) throw new AuthoringError("photoNotFound");
        book.setBackPhoto(backPhotoId);
      }
      if (photoFrames !== undefined) book.setPhotoFrames(photoFrames);
      if (tocLines !== undefined) book.setTocLines(tocLines);
      if (interiorStyle !== undefined) book.setInteriorStyle(interiorStyle);
      if (coverDesign !== undefined) {
        // Фото в слоях обложки — только фото этой книги.
        const ids = coverDesign === null ? [] : book.coverDesignPhotos(coverDesign);
        if (ids.length && !(await photos.belongToBook(book.id, ids))) throw new AuthoringError("photoNotFound");
        book.setCoverDesign(coverDesign);
      }
      if (language && language !== book.language) {
        const from = this.themes.get(book.theme, book.language);
        const to = this.themes.get(book.theme, language);
        const texts = book.switchLanguage(language, from, to);
        await this.questions.replaceTemplates(book.id, texts);
        // Своя книга: глава с названием по умолчанию («Начало») переводится, свои названия глав остаются.
        if (hasOutline(book.theme) && from.firstChapterTitle && to.firstChapterTitle) await this.chapters.retitle(book.id, from.firstChapterTitle, to.firstChapterTitle);
      }
      book.applySettings(settings);
      await this.books.save(book);
      return book;
    });
  }

  /** Удалить книгу можно, пока по ней нет заказов; файлы фото, кэш предпросмотра и картинки полос — тоже. */
  async delete(bookId: string, viewer: BookViewer) {
    const book = await loadBook(this.books, bookId, viewer, { editable: true });
    if (await this.orders.bookHasOrders(book.id)) throw new AuthoringError("bookHasOrders");
    await this.books.delete(book.id);
    await this.files.deletePrefix(`photos/${book.id}`);
    await this.files.deletePrefix(`cache/preview/${book.id}`);
    await this.files.deletePrefix(`cache/pages/${book.id}`);
  }

  async setLetterInvite(bookId: string, viewer: BookViewer, enabled: boolean, regenerate: boolean) {
    const book = await loadBook(this.books, bookId, viewer, { editable: true });
    const token = book.setLetterInvite(enabled, regenerate, () => this.ids.inviteToken());
    await this.books.save(book);
    return token;
  }
}

/**
 * Книга и заказ: готовность к печати, блокировка на время заказа. Вызывается контекстом Ordering
 * (внутри его транзакции — запросы идут через текущий Unit of Work).
 */
export class BookOrderingService {
  constructor(
    private readonly books: BookRepository,
    private readonly readiness: (bookId: string, locale: Locale) => Promise<{ blockingIssue: string | null; estimatedPages: number } | null>,
  ) {}

  async checkoutInfo(bookId: string, userId: string, locale: Locale) {
    const book = await this.books.findById(bookId);
    if (!book || book.userId !== userId) return null;
    const r = await this.readiness(bookId, locale);
    return r ? { status: book.status, ...r } : null;
  }

  lockForOrder(bookId: string) {
    return this.books.lockForOrder(bookId);
  }

  unlock(bookId: string) {
    return this.books.setStatus(bookId, "draft");
  }

  /** Сотрудник временно открывает заказанную книгу для правок (и закрывает обратно). */
  async toggleEditing(bookId: string): Promise<"draft" | "ordered"> {
    const book = await this.books.findById(bookId);
    const next = book?.status === "draft" ? "ordered" : "draft";
    await this.books.setStatus(bookId, next);
    return next;
  }
}

export class QuestionsService {
  constructor(
    private readonly books: BookRepository,
    private readonly questions: QuestionRepository,
    private readonly uow: UnitOfWork,
    private readonly photos: PhotoRepository,
    private readonly chapters: ChapterRepository,
  ) {}

  /**
   * Перенос истории в книге с темой (вкладка «Страницы» → «Главы книги»): в главу chapter перед историей beforeId, без
   * неё — в конец главы. Глава — из тех, что уже есть в книге (у темы у каждой главы есть вопросы). Позиции всех вопросов
   * пересчитываются по порядку; своя книга переносит разделы через оглавление (BookOutlineService.reorderSections).
   */
  async moveStory(bookId: string, viewer: BookViewer, input: { id: string; chapter: string; beforeId?: string | null }) {
    return this.uow.run(async () => {
      const book = await loadBook(this.books, bookId, viewer, { editable: true, lock: true });
      if (hasOutline(book.theme)) throw new AuthoringError("outlineNotAllowed");
      const all = await this.questions.sections(book.id);
      const moved = all.find((q) => q.id === input.id);
      if (!moved || !all.some((q) => q.chapter === input.chapter)) throw new AuthoringError("questionNotFound");
      if (input.beforeId && (input.beforeId === input.id || all.find((q) => q.id === input.beforeId)?.chapter !== input.chapter)) throw new AuthoringError("outlineOutdated");
      const rest = all.filter((q) => q.id !== input.id).map((q) => ({ id: q.id, chapter: q.chapter }));
      const at = input.beforeId ? rest.findIndex((q) => q.id === input.beforeId) : rest.findLastIndex((q) => q.chapter === input.chapter) + 1;
      rest.splice(at, 0, { id: moved.id, chapter: input.chapter });
      await this.questions.arrange(book.id, rest);
      await this.books.touch(book.id);
    });
  }

  /**
   * Автосохранение ответа и заголовка. У разделов своей книги (blank) правятся ещё заголовок и подсказка (title, prompt),
   * а переписанный заголовок и его скрытие не используются; в остальных книгах title и prompt — outlineNotAllowed:
   * у своих вопросов там заголовок правят через displayText, и правка prompt без title рассинхронизировала бы вопрос.
   */
  async edit(bookId: string, viewer: BookViewer, questionId: string, patch: QuestionPatch) {
    return this.uow.run(async () => {
      // Строка книги — первой, как у операций оглавления: иначе автосохранение держит строку вопроса и ждёт книгу
      // (touch), а перестановка держит книгу и ждёт этот вопрос (перенумерация) — взаимная блокировка (deadlock).
      // Заодно заказ, оформленный посреди сохранения, не пропустит правку в уже заказанную книгу.
      const book = await loadBook(this.books, bookId, viewer, { editable: true, lock: true });
      const q = await this.questions.findInBook(book.id, questionId);
      if (!q) throw new AuthoringError("questionNotFound");
      const outline = hasOutline(book.theme);
      if ((patch.title !== undefined || patch.prompt !== undefined) && !(outline && q.isCustom)) throw new AuthoringError("outlineNotAllowed");
      const wordsBefore = q.words;
      q.edit(outline ? { answer: patch.answer, media: patch.media, title: patch.title, prompt: patch.prompt, pageBreak: patch.pageBreak } : patch);
      await this.questions.save(q);
      await this.books.touch(book.id);
      this.uow.track(q);
      // Своя книга идёт по вехам по словам всей книги: событие, когда сумма пересекла порог progressOf.
      if (outline && !q.hasPendingEvents && q.words !== wordsBefore) {
        const after = await this.questions.wordsInBook(book.id);
        const at = (words: number) => ({ answered: 1, total: 1, words });
        if (progressChanged("blank", at(after - q.words + wordsBefore), at(after))) {
          book.noteProgress();
          this.uow.track(book);
        }
      }
    });
  }

  /** Свой вопрос — сразу после указанного, в ту же главу (книги с банком; у своей книги — BookOutlineService.addSection). */
  async addCustom(bookId: string, viewer: BookViewer, afterId: string, prompt: string) {
    return this.uow.run(async () => {
      const book = await loadBook(this.books, bookId, viewer, { editable: true, lock: true });
      if (hasOutline(book.theme)) throw new AuthoringError("outlineNotAllowed");
      const after = await this.questions.findInBook(book.id, afterId);
      if (!after) throw new AuthoringError("questionNotFound");
      if ((await this.questions.count(book.id)) >= MAX_QUESTIONS) throw new AuthoringError("questionsLimit");
      return this.questions.insertAfter(after, prompt.trim());
    });
  }

  /**
   * Удалять можно только собственные вопросы (у своей книги — любой раздел: все они custom). Фото раздела остаются
   * в книге среди общих, позиции выравниваются (письма ведут по ним к первому пустому вопросу), а если в разделе
   * был текст — прогресс книги сдвинулся. Своей книге возвращает оглавление после удаления, остальным — null.
   */
  async deleteCustom(bookId: string, viewer: BookViewer, questionId: string): Promise<Outline | null> {
    return this.uow.run(async () => {
      const book = await loadBook(this.books, bookId, viewer, { editable: true, lock: true });
      const q = await this.questions.findInBook(book.id, questionId);
      if (!q) throw new AuthoringError("questionNotFound");
      if (!q.isCustom) throw new AuthoringError("onlyOwnQuestions");
      const outline = hasOutline(book.theme);
      await this.photos.detachFromQuestions(book.id, [q.id]);
      await this.questions.deleteCustom(book.id, q.id);
      await this.questions.renumber(book.id, outline ? "outline" : "bank");
      await this.books.touch(book.id);
      if (q.isAnswered) {
        book.noteProgress();
        this.uow.track(book);
      }
      return outline ? this.chapters.outline(book.id) : null;
    });
  }
}

const clip = (s: string, max: number) => s.trim().slice(0, max);

/**
 * Оглавление своей книги (тема blank): главы и разделы. Каждая операция — в одной транзакции с блокировкой строки
 * книги (параллельные вкладки и устройства идут по очереди: лимиты и набор проверяются под блокировкой), кончается
 * перенумерацией (§1.6) и возвращает актуальное оглавление. В книгах с банком — outlineNotAllowed.
 * Заголовок и подсказка раздела правятся через QuestionsService.edit, раздел удаляется QuestionsService.deleteCustom.
 */
export class BookOutlineService {
  constructor(
    private readonly books: BookRepository,
    private readonly questions: QuestionRepository,
    private readonly chapters: ChapterRepository,
    private readonly photos: PhotoRepository,
    private readonly ids: IdGenerator,
    private readonly uow: UnitOfWork,
  ) {}

  private async load(bookId: string, viewer: BookViewer) {
    const book = await loadBook(this.books, bookId, viewer, { editable: true, lock: true });
    if (!hasOutline(book.theme)) throw new AuthoringError("outlineNotAllowed");
    return book;
  }

  /** Конец операции: позиции разделов по главам, отметка изменения, событие прогресса (если ушёл текст), оглавление. */
  private async finish(book: Book, lostText = false): Promise<Outline> {
    await this.questions.renumber(book.id, "outline");
    await this.books.touch(book.id);
    if (lostText) {
      book.noteProgress();
      this.uow.track(book);
    }
    return this.chapters.outline(book.id);
  }

  /** Новая глава (после afterKey или в конец) — сразу с пустым разделом, чтобы было куда писать. */
  addChapter(bookId: string, viewer: BookViewer, input: { title: string; afterKey?: string | null }): Promise<{ key: string; sectionId: string; outline: Outline }> {
    return this.uow.run(async () => {
      const book = await this.load(bookId, viewer);
      const chapters = await this.chapters.list(book.id);
      if (chapters.length >= MAX_CHAPTERS) throw new AuthoringError("chaptersLimit", undefined, [MAX_CHAPTERS]);
      const afterKey = input.afterKey ?? null;
      if (afterKey !== null && !chapters.some((c) => c.key === afterKey)) throw new AuthoringError("chapterNotFound");
      // Глава приходит с разделом: при полной книге не создаём «главу без раздела».
      if ((await this.questions.count(book.id)) >= MAX_QUESTIONS) throw new AuthoringError("questionsLimit");
      const key = this.ids.uuid();
      const keys = insertKey(
        chapters.map((c) => c.key),
        key,
        afterKey,
      );
      await this.chapters.add(book.id, { key, title: clip(input.title, CHAPTER_TITLE_MAX), epigraph: "", position: keys.indexOf(key) });
      await this.chapters.setOrder(book.id, keys);
      const sectionId = await this.questions.insertSection(book.id, key, null, { title: "", prompt: "" });
      return { key, sectionId, outline: await this.finish(book) };
    });
  }

  /** Название и эпиграф главы. */
  renameChapter(bookId: string, viewer: BookViewer, key: string, patch: { title?: string; epigraph?: string }): Promise<Outline> {
    return this.uow.run(async () => {
      const book = await this.load(bookId, viewer);
      const clean = {
        ...(patch.title !== undefined ? { title: clip(patch.title, CHAPTER_TITLE_MAX) } : {}),
        ...(patch.epigraph !== undefined ? { epigraph: clip(patch.epigraph, CHAPTER_EPIGRAPH_MAX) } : {}),
      };
      if (!(await this.chapters.update(book.id, key, clean))) throw new AuthoringError("chapterNotFound");
      await this.books.touch(book.id);
      return this.chapters.outline(book.id);
    });
  }

  /** Полный порядок глав: тот же набор ключей, иначе клиент видит устаревшее оглавление (outlineOutdated). */
  reorderChapters(bookId: string, viewer: BookViewer, keys: string[]): Promise<Outline> {
    return this.uow.run(async () => {
      const book = await this.load(bookId, viewer);
      const current = await this.chapters.list(book.id);
      if (
        !sameSet(
          keys,
          current.map((c) => c.key),
        )
      )
        throw new AuthoringError("outlineOutdated");
      await this.chapters.setOrder(book.id, keys);
      return this.finish(book);
    });
  }

  /** Глава удаляется вместе с разделами; их фото остаются в книге среди общих (вкладка «Фото»). */
  deleteChapter(bookId: string, viewer: BookViewer, key: string): Promise<Outline> {
    return this.uow.run(async () => {
      const book = await this.load(bookId, viewer);
      const current = await this.chapters.list(book.id);
      if (!current.some((c) => c.key === key)) throw new AuthoringError("chapterNotFound");
      await this.photos.detachFromQuestions(book.id, await this.questions.idsInChapter(book.id, key));
      const { hadText } = await this.questions.deleteChapter(book.id, key);
      await this.chapters.delete(book.id, key);
      await this.chapters.setOrder(
        book.id,
        current.filter((c) => c.key !== key).map((c) => c.key),
      );
      return this.finish(book, hadText);
    });
  }

  /** Новый раздел в главе: после afterId (он обязан быть в этой главе) или в конец главы. */
  addSection(bookId: string, viewer: BookViewer, input: { chapterKey: string; afterId?: string | null; title: string; prompt: string }): Promise<{ id: string; outline: Outline }> {
    return this.uow.run(async () => {
      const book = await this.load(bookId, viewer);
      const chapters = await this.chapters.list(book.id);
      if (!chapters.some((c) => c.key === input.chapterKey)) throw new AuthoringError("chapterNotFound");
      if ((await this.questions.count(book.id)) >= MAX_QUESTIONS) throw new AuthoringError("questionsLimit");
      const after = input.afterId ? await this.questions.findInBook(book.id, input.afterId) : null;
      if (input.afterId && !after) throw new AuthoringError("questionNotFound");
      if (after && after.chapter !== input.chapterKey) throw new AuthoringError("outlineOutdated");
      const id = await this.questions.insertSection(book.id, input.chapterKey, after, { title: clip(input.title, SECTION_TITLE_MAX), prompt: clip(input.prompt, SECTION_PROMPT_MAX) });
      return { id, outline: await this.finish(book) };
    });
  }

  /** Полный порядок разделов с главами: тот же набор id и существующие главы, иначе outlineOutdated. */
  reorderSections(bookId: string, viewer: BookViewer, order: { id: string; chapter: string }[]): Promise<Outline> {
    return this.uow.run(async () => {
      const book = await this.load(bookId, viewer);
      const sections = await this.questions.sections(book.id);
      const keys = new Set((await this.chapters.list(book.id)).map((c) => c.key));
      const sameIds = sameSet(
        order.map((s) => s.id),
        sections.map((s) => s.id),
      );
      if (!sameIds || !order.every((s) => keys.has(s.chapter))) throw new AuthoringError("outlineOutdated");
      await this.questions.arrange(book.id, order);
      return this.finish(book);
    });
  }

  /** Оглавление книги: главы и разделы по порядку (видно и сотруднику только на просмотр). */
  async outline(bookId: string, viewer: BookViewer): Promise<Outline> {
    const book = await loadBook(this.books, bookId, viewer);
    return this.chapters.outline(book.id);
  }
}

/** Правка фото, по которой оно может сменить место: глава, фото начала главы, ответ. */
const touchesPlace = (patch: PhotoPatch) => patch.chapter !== undefined || patch.opener !== undefined || patch.questionId !== undefined;

export type PhotoPatch = Parameters<Photo["update"]>[0];

export class PhotosService {
  constructor(
    private readonly books: BookRepository,
    private readonly photos: PhotoRepository,
    private readonly questions: QuestionRepository,
    private readonly images: ImageProcessor,
    private readonly files: FileStore,
    private readonly ids: IdGenerator,
    /** Транзакция пакетной правки; нет — запросы по одному (двойники в тестах). */
    private readonly uow?: UnitOfWork,
    /** Перевод на правила раскладки фото 2 при правке мест (выпуск 2); нет — не переводить. */
    private readonly layout?: LayoutUpgrade,
  ) {}


  /** Одна правка фото по правилам Photo.update: ответ — из этой книги, фото начала главы у главы одно. */
  private async apply(book: Book, photoId: string, patch: PhotoPatch) {
    if (patch.questionId && !(await this.questions.findInBook(book.id, patch.questionId))) throw new AuthoringError("questionNotFound");
    const photo = await this.photos.findInBook(book.id, photoId);
    if (!photo) throw new AuthoringError("photoNotFound");
    photo.update(patch);
    await this.photos.save(photo);
    if (patch.opener && photo.snapshot().opener && photo.chapter) await this.photos.clearOpeners(book.id, photo.chapter, photo.id);
    return photo;
  }

  /** Загрузка пачки фото: каждое обрабатывается отдельно, ошибки по файлам возвращаются списком. */
  async upload(bookId: string, viewer: BookViewer, files: { name: string; size: number; bytes: () => Promise<Buffer> }[]) {
    const book = await loadBook(this.books, bookId, viewer, { editable: true });
    if (!files.length) throw new AuthoringError("photosPick");
    const { count, maxPosition } = await this.photos.stats(book.id);
    if (count + files.length > MAX_PHOTOS) throw new AuthoringError("photosLimit", undefined, [MAX_PHOTOS]);
    const created: Photo[] = [];
    const failed: { name: string; reason: "tooBig" | "format" }[] = [];
    let position = maxPosition + 1;
    for (const file of files) {
      if (file.size > this.images.maxUploadBytes) {
        failed.push({ name: file.name, reason: "tooBig" });
        continue;
      }
      try {
        const img = await this.images.process(await file.bytes());
        const id = this.ids.uuid();
        const storageKey = `photos/${book.id}/${id}.jpg`;
        const thumbKey = `photos/${book.id}/${id}_thumb.jpg`;
        await this.files.put(storageKey, img.full);
        await this.files.put(thumbKey, img.thumb);
        const photo = Photo.uploaded(id, { bookId: book.id, position: position++, storageKey, thumbKey, width: img.width, height: img.height });
        await this.photos.add(photo);
        created.push(photo);
      } catch (err) {
        console.error("[photos] upload failed", err);
        failed.push({ name: file.name, reason: "format" });
      }
    }
    await this.books.touch(book.id);
    return { created, failed };
  }

  /**
   * Правка одного фото. Книга блокируется до конца транзакции: save пишет снимок фото целиком (с главой, отметкой и
   * позицией), а перевод на правила 2 (скрипт или при правке) пишет их под той же блокировкой — снимок, прочитанный до
   * перевода, его не затрёт. Правка места (выпуск 2) сначала переводит книгу с прежними правилами — как пакет.
   */
  async update(bookId: string, viewer: BookViewer, photoId: string, patch: PhotoPatch) {
    if (this.layout?.onTouch && touchesPlace(patch)) return (await this.batch(bookId, viewer, [{ id: photoId, patch }]))[0];
    const work = async () => {
      const book = await loadBook(this.books, bookId, viewer, { editable: true, lock: true });
      const photo = await this.apply(book, photoId, patch);
      await this.books.touch(book.id);
      return photo;
    };
    return this.uow ? this.uow.run(work) : work();
  }

  /**
   * Правки нескольких фото одной транзакцией по тем же правилам, что update (убрать из альбома, «показать целиком»
   * пачкой, подсказки): ошибка в любой — не меняется ни одно. Книга блокируется, заказанную править нельзя. Книгу
   * с прежними правилами пакет сначала переводит на правила 2 (выпуск 2: перевод при правке).
   */
  async batch(bookId: string, viewer: BookViewer, updates: readonly { id: string; patch: PhotoPatch }[]) {
    const work = async () => {
      const book = await loadBook(this.books, bookId, viewer, { editable: true, lock: true });
      if (this.layout?.onTouch && book.layoutRev !== LAYOUT_REV_2) await this.layout.upgrade(book.id);
      const out: Photo[] = [];
      for (const { id, patch } of updates) out.push(await this.apply(book, id, patch));
      await this.books.touch(book.id);
      return out;
    };
    return this.uow ? this.uow.run(work) : work();
  }

  async delete(bookId: string, viewer: BookViewer, photoId: string) {
    const book = await loadBook(this.books, bookId, viewer, { editable: true });
    const photo = await this.photos.findInBook(book.id, photoId);
    if (!photo) throw new AuthoringError("photoNotFound");
    await this.photos.delete(photo);
    if (book.usesPhoto(photo.id)) {
      book.forgetPhoto(photo.id);
      await this.books.save(book);
    }
    await Promise.all([this.files.delete(photo.storageKey), this.files.delete(photo.thumbKey)]);
    await this.books.touch(book.id);
  }

  async reorder(bookId: string, viewer: BookViewer, ids: string[]) {
    const book = await loadBook(this.books, bookId, viewer, { editable: true });
    if (!(await this.photos.belongToBook(book.id, ids))) throw new AuthoringError("photosOutdated");
    await this.photos.reorder(book.id, ids);
  }

  /**
   * Поворот самого файла на 90°. Новые ключи — чтобы браузер и кэш предпросмотра не показали старую ориентацию.
   * Файлы обрабатываются без блокировки (это секунды), а запись — под блокировкой книги по строке, перечитанной после
   * обработки, и только полей поворота (файлы, размеры, кадр и вид в ответе): правка места или перевод на правила 2,
   * записанные за это время, не откатываются. Фото успели повернуть или заменить файл — поворот не по тому снимку,
   * новые файлы удаляются (photosOutdated).
   */
  async rotate(bookId: string, viewer: BookViewer, photoId: string) {
    const book = await loadBook(this.books, bookId, viewer, { editable: true });
    const photo = await this.photos.findInBook(book.id, photoId);
    if (!photo) throw new AuthoringError("photoNotFound");
    const [full, thumb] = await Promise.all([this.files.get(photo.storageKey), this.files.get(photo.thumbKey)]);
    const out = await this.images.rotate(full, thumb);
    const rev = this.ids.revision();
    const keys = { storageKey: `photos/${book.id}/${photo.id}_${rev}.jpg`, thumbKey: `photos/${book.id}/${photo.id}_${rev}_thumb.jpg` };
    await Promise.all([this.files.put(keys.storageKey, out.full), this.files.put(keys.thumbKey, out.thumb)]);
    const dropNew = () => Promise.all([this.files.delete(keys.storageKey), this.files.delete(keys.thumbKey)]).catch(() => {});
    const work = async () => {
      await loadBook(this.books, bookId, viewer, { editable: true, lock: true });
      const fresh = await this.photos.findInBook(book.id, photoId);
      if (!fresh) throw new AuthoringError("photoNotFound");
      if (fresh.storageKey !== photo.storageKey) throw new AuthoringError("photosOutdated");
      const previous = fresh.rotated(keys);
      await this.photos.saveRotation(fresh);
      await this.books.touch(book.id);
      return { fresh, previous };
    };
    let saved: Awaited<ReturnType<typeof work>>;
    try {
      saved = await (this.uow ? this.uow.run(work) : work());
    } catch (err) {
      await dropNew();
      throw err;
    }
    await Promise.all([this.files.delete(saved.previous.storageKey), this.files.delete(saved.previous.thumbKey)]).catch(() => {});
    return saved.fresh;
  }

  /**
   * Явный перевод книги на правила раскладки фото 2 — редактор зовёт его перед первой правкой мест (POST …/layout),
   * чтобы его превью, счётчик и снимки для «Отменить» сразу шли по строкам и правилам, которые запишет правка.
   * Права — как у правки фото, книга заблокирована до конца транзакции. Возвращает версию правил после него: прежнюю,
   * если перевод не повторяет вёрстку (правка тогда идёт по правилам 1, как раньше) или выпуск 2 выключен.
   */
  async upgradeLayout(bookId: string, viewer: BookViewer): Promise<number> {
    const work = async () => {
      const book = await loadBook(this.books, bookId, viewer, { editable: true, lock: true });
      if (book.layoutRev === LAYOUT_REV_2 || !this.layout?.onTouch) return book.layoutRev;
      return (await this.layout.upgrade(book.id)) ? LAYOUT_REV_2 : book.layoutRev;
    };
    return this.uow ? this.uow.run(work) : work();
  }
}

export class LettersService {
  constructor(
    private readonly books: BookRepository,
    private readonly letters: LetterRepository,
    private readonly ids: IdGenerator,
    private readonly uow: UnitOfWork,
  ) {}

  /** Письмо по публичной ссылке-приглашению: ждёт одобрения владельца книги. */
  async submit(token: string, input: { authorName: string; relation: string; text: string }) {
    if (!/^[A-Za-z0-9_-]{10,40}$/.test(token)) throw new AuthoringError("letterInvalid");
    const book = await this.books.findByInviteToken(token);
    if (!book) throw new AuthoringError("letterClosed");
    book.assertAcceptsLetters();
    if ((await this.letters.count(book.id)) >= MAX_LETTERS) throw new AuthoringError("letterLimit");
    const letter = Letter.submit(this.ids.uuid(), { bookId: book.id, ...input });
    await this.uow.run(async () => {
      await this.letters.add(letter);
      this.uow.track(letter);
    });
    return letter;
  }

  async edit(bookId: string, viewer: BookViewer, letterId: string, patch: { status?: LetterStatus; authorName?: string; relation?: string; text?: string }) {
    const book = await loadBook(this.books, bookId, viewer, { editable: true });
    const letter = await this.letters.findInBook(book.id, letterId);
    if (!letter) throw new AuthoringError("letterNotFound");
    letter.edit(patch);
    await this.letters.save(letter);
    await this.books.touch(book.id);
    return letter;
  }

  async delete(bookId: string, viewer: BookViewer, letterId: string) {
    const book = await loadBook(this.books, bookId, viewer, { editable: true });
    if (!(await this.letters.delete(book.id, letterId))) throw new AuthoringError("letterNotFound");
  }
}

export type PhotoLayout = PhotoProps["layout"];
