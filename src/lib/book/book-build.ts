/**
 * Сборка книги для экрана: один рендер react-pdf на отпечаток содержимого, и все «как это будет выглядеть» —
 * предпросмотр PDF, 3D-книга, превью — показывают растр его полос. Здесь только типы и адреса (без node), их
 * читают и сервер, и клиент. Сборку делает production (BookPreviewService), отдают /api/books/[id]/build и /pages.
 */

export type BookPageKind = "front" | "toc" | "opener" | "text" | "photo" | "gallery" | "end" | "pad";

export interface BookBuildPage {
  /** Номер полосы, с 1. */
  n: number;
  kind: BookPageKind;
  /** Глава полосы: у начальной полосы, текста и фото главы; у начальной полосы галереи — "__gallery". */
  chapterKey?: string;
}

export interface BookBuild {
  /** Отпечаток содержимого (contentFingerprint) — ключ кэша сборки. */
  fp: string;
  /** Полос в печати: вместе с пустыми полосами добивки до кратности print.pageMultiple. */
  pageCount: number;
  /** Полос с содержимым (без добивки). */
  contentPages: number;
  /** Обрезной формат, мм: картинки полос — ровно он, без вылетов. */
  trimMm: { w: number; h: number };
  /** Все полосы по порядку, длина — pageCount. */
  pages: BookBuildPage[];
  /** Глава → её начальная полоса (с 1), те же номера, что в оглавлении (tocPages). */
  chapterPages: Record<string, number>;
  /** "/api/books/<bookId>/pages/<fp>" — к нему добавляется номер полосы. */
  imageBase: string;
}

/** Этапы сборки PDF по порядку: фото под печать, доводка вёрстки, итоговая сборка, обложка, упаковка файлов. */
export type RenderStageName = "images" | "flow" | "final" | "cover" | "finish";

/** Ход сборки для экрана (RenderProgress.snapshot): этап, сколько готово и сколько осталось по замерам прошлых сборок. */
export interface BuildProgress {
  /** queued — ждёт свободного места рендера, running — идёт. */
  state: "queued" | "running";
  stage: RenderStageName | null;
  /** 0–99. */
  percent: number;
  /** Сколько мс осталось по оценке; null — оценить нечем (стоит в очереди). */
  etaMs: number | null;
  /** Идёт дольше оценки: срок уже не показываем. */
  overrun: boolean;
  /** Сколько сборок стоят перед этой. */
  ahead: number;
}

export type BookBuildState =
  | { status: "ready"; build: BookBuild }
  | { status: "building"; previous: BookBuild | null }
  | {
      status: "failed";
      previous: BookBuild | null;
      error: string;
      /** Через сколько мс сработает ручной повтор (/build?retry=1); 0 — уже. Относительно ответа: часы клиента могут врать. */
      retryInMs?: number;
    };

export const PAGE_IMAGE_WIDTHS = [480, 800, 1200, 1600] as const;

export type PageImageWidth = (typeof PAGE_IMAGE_WIDTHS)[number];

export const pageImageUrl = (b: BookBuild, n: number, w: (typeof PAGE_IMAGE_WIDTHS)[number]) => `${b.imageBase}/${n}?w=${w}`;

/** Сборка в кэше (манифест рядом с PDF): адрес картинок зависит от книги и добавляется при чтении. */
export type BookBuildManifest = Omit<BookBuild, "imageBase">;

export const isPageImageWidth = (w: number): w is PageImageWidth => (PAGE_IMAGE_WIDTHS as readonly number[]).includes(w);

/** Отпечаток сборки в адресе: 16 шестнадцатеричных знаков, как у contentFingerprint. */
export const isBuildFingerprint = (fp: string) => /^[0-9a-f]{16}$/.test(fp);

export const buildImageBase = (bookId: string, fp: string) => `/api/books/${bookId}/pages/${fp}`;
