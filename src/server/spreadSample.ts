import "server-only";
import { messagesFor } from "@/i18n/messages";
import { applyGender } from "@/lib/content/gender";
import { bookKind } from "@/lib/content/kinds";
import { getTheme } from "@/lib/content/themes";
import { getFormat } from "@/lib/book/formats";
import { bookInterior } from "@/lib/book/interiors";
import { estimateChapterPages, openerPage, sectionPageOffsets, textMetrics } from "@/lib/book/estimate";
import { GALLERY_KEY, sampleToc, tocCandidates } from "@/lib/book/toc";
import { buildBookContent } from "@/lib/book/book-content";
import { LAYOUT_REV_2, frontPages, printableText, toPhotoItem, type ContentChapter, type ContentItem, type LetterLike, type PhotoItem } from "@/lib/book/layout";
import { splitParagraphsDetailed } from "@/lib/book/inline-photo";
import { photoUrl } from "@/lib/urls";

/**
 * Сколько текста первой главы брать на разворот (целыми историями): полосы всё равно обрезаются по полосе набора, а
 * без начальной полосы глава занимает обе полосы разворота.
 */
const SAMPLE_CHARS = 4500;

/**
 * Содержимое для разворотов в выбранном оформлении — на настоящем тексте книги, а пока ответов
 * нет, на примере на языке книги. Общее для вкладок «Страницы» и «Обложка». Форму результата
 * (SpreadSample) объявляет компонент разворота, поэтому её сверяет тип его свойства sample.
 */
export function bookSpreadSample(
  book: Parameters<typeof buildBookContent>[0],
  questions: Parameters<typeof buildBookContent>[1],
  /** Главы своей книги по порядку (у книг с банком — пусто). */
  chapters: Parameters<typeof buildBookContent>[3],
  dedicationPlaceholder: string,
  /** Фото книги: в примерах фотостраниц и начала главы показываем их, а не пейзажи-заглушки. */
  photos: (Parameters<typeof toPhotoItem>[0] & { caption: string })[] = [],
  /** Номера страниц готового макета этой книги (BookBuild.chapterPages: ключи — pageKey оглавления); нет — оценка. */
  realPages?: Record<string, number> | null,
  /** Одобренные письма близких: последняя глава книги — и строка оглавления. */
  letters: LetterLike[] = [],
) {
  const format = getFormat(book.format);
  // Та же сборка, что у PDF: с фото (они занимают полосы — от них номера страниц) и письмами (строка оглавления).
  const content = buildBookContent(book, questions, photos.map(toPhotoItem), chapters, undefined, letters);
  const theme = getTheme(book.theme, book.language);
  const t = messagesFor(book.language);
  const kind = bookKind(book.theme);
  // Пример до первых ответов: у подарков — любовная история с лендинга, у автобиографии — рассказ о детстве, у своей книги — нейтральная заглушка.
  const own = kind === "gift" ? null : t.book.sampleByKind[kind];
  const ownEpigraph: string | undefined = own && "epigraph" in own ? String(own.epigraph) : undefined;
  const sample = t.landing.sample;
  const first = content.chapters[0];
  // Пока ответов нет — главы книги: своей книги — её оглавление (текст автора, без подстановки рода), остальных — темы.
  const g = (s: string) => applyGender(s, book.authorGender, book.recipientGender);
  const planned = chapters.length
    ? chapters.map((c) => ({ title: printableText(c.title.trim()) || t.book.untitledChapter, epigraph: printableText(c.epigraph.trim()) || undefined }))
    : theme.chapters.map((c) => ({ title: g(c.title), epigraph: c.epigraph }));
  const firstPlanned = planned[0];

  // Текст первой главы — как его печатает PDF: истории целиком (с фото в тексте, QR, строфами и «с новой страницы»),
  // пока не наберётся SAMPLE_CHARS; фото на всю страницу — своя полоса, на нём разворот кончается.
  // Форма — SampleEntry разворота (components/interior/entry.tsx); тип сверяет свойство sample у InteriorSpread.
  const entries: {
    heading: string | null;
    paragraphs: string[];
    breaks?: number[];
    photos?: { id: string; url: string; width: number; height: number; caption: string; inline?: PhotoItem["inline"] }[];
    media?: NonNullable<ContentItem["media"]>;
    pageBreak?: boolean;
    continued?: boolean;
  }[] = [];
  let whole = !!first;
  if (first) {
    let budget = SAMPLE_CHARS;
    for (const [i, it] of first.items.entries()) {
      if (budget <= 0 || (it.photoBefore && i > 0)) {
        whole = false;
        break;
      }
      const { paragraphs, breaks } = splitParagraphsDetailed(it.answer);
      entries.push({
        heading: it.heading,
        paragraphs,
        ...(breaks.size ? { breaks: [...breaks] } : {}),
        ...(it.photos?.length ? { photos: it.photos.map((p) => ({ id: p.id, url: photoUrl(p.id, "view"), width: p.width, height: p.height, caption: p.caption, inline: p.inline })) } : {}),
        ...(it.media?.length ? { media: it.media } : {}),
        ...(it.pageBreak ? { pageBreak: true } : {}),
        ...(it.continued ? { continued: true } : {}),
      });
      budget -= it.answer.length;
    }
  } else {
    const s = own ?? sample;
    entries.push({ heading: s.h1, paragraphs: [s.p1, s.p2] }, { heading: s.h2, paragraphs: [s.p3, s.p4] });
  }

  // Оглавление: все строки, которые могут в него попасть, с номерами страниц — из готового макета, а каких там нет
  // (макет не собран, раздел в оглавлении по главам) — примерными (пока ответов нет — главы темы). Режим и свои
  // названия применяет selectToc — здесь и в редакторе «Страницы», где их меняют на лету.
  const metrics = textMetrics(format, bookInterior(book));
  const start = frontPages(content) + 1 + (book.dedication.trim() ? 1 : 0) + 1; // титул, оборот, посвящение, оглавление
  const pageOf = new Map<string, number>();
  let page = start;
  for (const c of content.chapters) {
    // Начальная полоса слева (книги на полосах глав 2): перед ней может встать пустая.
    // Без начальных полос глава начинается с первой полосы текста, где выпадет.
    const start = content.chapterStart;
    if (!start) page = openerPage(content, page);
    pageOf.set(c.key, page);
    sectionPageOffsets(c, metrics, start).forEach((offset, i) => pageOf.set(`q:${c.items[i].id}`, page + offset));
    page += estimateChapterPages(c, metrics, start);
  }
  pageOf.set(GALLERY_KEY, openerPage(content, page));
  for (const [key, n] of Object.entries(realPages ?? {})) if (pageOf.has(key)) pageOf.set(key, n);
  // Номер первой полосы текста первой главы — колонцифра на развороте «Глава» (без начальной полосы — это её же страница).
  const firstText = first ? (pageOf.get(first.key) ?? start) + (content.chapterStart ? 0 : 1) : undefined;
  const tocAll = content.chapters.length
    ? tocCandidates(content).map((c) => ({ ...c, page: pageOf.get(c.pageKey) ?? start }))
    : planned.map((c, i) => ({ key: `c:planned-${i}`, pageKey: `planned-${i}`, kind: "chapter" as const, number: i + 1, label: c.title, page: start + i * 6 }));
  const tocMode = book.tocMode ?? "chapters";
  const tocSettings = book.tocLines ?? {};

  return {
    language: book.language,
    title: content.title,
    subtitle: book.subtitle.trim(),
    author: book.authorName.trim(),
    year: content.year,
    dedication: book.dedication.trim(),
    dedicationPlaceholder,
    chapter: first
      ? { number: 1, title: first.title, epigraph: first.epigraph }
      : kind === "autobiography"
        ? // Пример рассказа о детстве идёт с главой о детстве, а не с «Вместо предисловия» из оглавления.
          { number: 1, title: own!.chapterTitle, epigraph: ownEpigraph }
        : // У главы автора без эпиграфа пример эпиграфа не подставляем: это его текст.
          { number: 1, title: firstPlanned?.title ?? (own ?? sample).chapterTitle, epigraph: chapters.length ? firstPlanned?.epigraph : (firstPlanned?.epigraph ?? (own ? ownEpigraph : sample.epigraph)) },
    entries,
    // Вся первая глава уместилась в пример — после неё концовка, как в PDF.
    ...(whole ? { tail: true } : {}),
    ...(firstText ? { folio: firstText } : {}),
    toc: sampleToc(tocAll, tocMode, tocSettings),
    tocAll,
    tocMode,
    tocLines: tocSettings,
    showToc: book.showToc,
    endText: book.endText ?? null,
    titlePage: content.titlePage !== false,
    ...(content.chapterStart ? { chapterStart: content.chapterStart } : {}),
    captions: own?.photos,
    photos: photos.filter((p) => p.id !== book.coverPhotoId).slice(0, 4).map((p) => ({ url: photoUrl(p.id, "full"), width: p.width, height: p.height, caption: p.caption })),
    // Правила 2: начало главы — как в книге, выбранное автором фото главы или страница с названием (не «первое фото»).
    ...(book.layoutRev === LAYOUT_REV_2 ? { opener: sampleOpener(first) } : {}),
  };
}

/**
 * Фото главы первой главы по правилам 2: выбранное автором (его кадр — тоже). Оформление книги может быть и без фото
 * главы — тогда отмеченное фото стоит после главы (R5), а разворот других оформлений всё равно покажет его в начале.
 */
function sampleOpener(ch: ContentChapter | undefined): { url: string; crop?: NonNullable<ContentChapter["openerPhoto"]>["crop"] } | null {
  if (!ch) return null;
  const keys = [ch.key, ...(ch.folded ?? []).map((f) => f.key)];
  const marked = ch.photos.filter((p) => p.opener && keys.includes(p.chapter!));
  const photo = ch.openerPhoto ?? marked.find((p) => p.chapter === ch.key) ?? marked[0];
  return photo ? { url: photoUrl(photo.id, "view"), ...(photo.crop ? { crop: photo.crop } : {}) } : null;
}

