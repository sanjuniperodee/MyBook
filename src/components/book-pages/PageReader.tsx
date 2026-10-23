"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Download, LoaderCircle, RotateCcw, TriangleAlert } from "lucide-react";
import { useLocale, useMessages } from "@/i18n/client";
import { localeMeta } from "@/i18n/config";
import { pageImageUrl, type BookBuild, type BookBuildState, type BuildProgress, type PageImageWidth } from "@/lib/book/book-build";
import { cn } from "@/lib/class-names";
import { progressSummary, RenderStatus } from "@/components/ui/RenderProgress";
import { useBookBuild } from "./useBookBuild";
import { useBuildProgress } from "./useBuildProgress";

type Side = "left" | "right";
export type Spread = [left: number | null, right: number | null];

/** Развороты как в настоящей книге: первая полоса — одна справа, дальше 2–3, 4–5…; последняя чётная — одна слева. */
export function bookSpreads(pageCount: number): Spread[] {
  if (pageCount < 1) return [];
  const spreads: Spread[] = [[null, 1]];
  for (let left = 2; left <= pageCount; left += 2) spreads.push([left, left < pageCount ? left + 1 : null]);
  return spreads;
}

// Ширина полосы на экране: телефон — колонка не шире max-w-md за вычетом полей страницы и рамки (66px), планшет —
// полразворота, компьютер — полразворота рядом с обложкой. Со «100vw» телефоны с DPR 3 брали самую большую картинку.
const PAGE_SIZES = "(min-width: 1024px) 400px, (min-width: 768px) calc(50vw - 50px), min(448px, calc(100vw - 66px))";
// Ширины для чтения: 1600 нужна только для увеличения — фото в экранной сборке 110 dpi, и на A5 800px — уже 137 dpi.
export const READER_WIDTHS: readonly PageImageWidth[] = [480, 800, 1200];
// Размеры в разметке задают пропорцию обрезного формата: место под полосу известно до загрузки — ничего не прыгает.
const BOX_WIDTH = 800;

/** Время, когда сработает повтор, — на языке страницы. */
const clock = (ms: number, locale: keyof typeof localeMeta) => new Date(ms).toLocaleTimeString(localeMeta[locale].intl, { hour: "2-digit", minute: "2-digit" });

function BookPage({ build, n, side, onFailed, onLoaded }: { build: BookBuild; n: number; side: Side; onFailed?: (n: number) => void; onLoaded?: (n: number) => void }) {
  const m = useMessages();
  const t = m.books.preview.reader;
  // Не загрузилась — заглушка с повтором; повтор перемонтирует картинку (тот же адрес: сбой браузер не кэширует).
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const height = Math.round((BOX_WIDTH * build.trimMm.h) / build.trimMm.w);
  return (
    <figure className="w-full max-w-md md:max-w-none md:flex-1">
      <div className="relative overflow-hidden bg-white shadow-soft">
        {failed ? (
          <div role="img" aria-label={t.page(n)} className="flex flex-col items-center justify-center gap-3 px-4 text-center text-sm text-muted" style={{ aspectRatio: `${BOX_WIDTH} / ${height}` }}>
            <TriangleAlert className="size-5" />
            <span>{t.pageFailed}</span>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                setFailed(false);
                setAttempt((a) => a + 1);
              }}
            >
              <RotateCcw className="size-4" /> {m.common.actions.retry}
            </button>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- растр полосы из /api/books/[id]/pages: свои размеры и кэш
          <img
            key={attempt}
            src={pageImageUrl(build, n, BOX_WIDTH)}
            srcSet={READER_WIDTHS.map((w) => `${pageImageUrl(build, n, w)} ${w}w`).join(", ")}
            sizes={PAGE_SIZES}
            width={BOX_WIDTH}
            height={height}
            loading="lazy"
            decoding="async"
            alt={t.page(n)}
            className="block h-auto w-full"
            onLoad={() => onLoaded?.(n)}
            onError={() => {
              setFailed(true);
              onFailed?.(n);
            }}
          />
        )}
        {/* Тень корешка — только на развороте. */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 hidden w-[7%] md:block",
            side === "left" ? "right-0 bg-gradient-to-l from-black/[.08] to-transparent" : "left-0 bg-gradient-to-r from-black/[.08] to-transparent",
          )}
        />
      </div>
      {/* Номер уже в подписи картинки («Страница n») — второй раз его не зачитываем. */}
      <figcaption aria-hidden className={cn("mt-2 text-center text-xs text-muted tabular-nums", side === "left" ? "md:pl-1 md:text-left" : "md:pr-1 md:text-right")}>
        {n}
      </figcaption>
    </figure>
  );
}

/**
 * Полосы сборки разворотами; на телефоне — по одной в ряд. Развороты вне экрана браузер не рисует и не держит
 * декодированными (content-visibility): длинная книга иначе съедала память iPhone. reload — перемонтировать картинки.
 */
export function BookSpreads({
  build,
  dimmed = false,
  reload = 0,
  onPageFailed,
  onPageLoaded,
}: {
  build: BookBuild;
  dimmed?: boolean;
  reload?: number;
  onPageFailed?: (n: number) => void;
  onPageLoaded?: (n: number) => void;
}) {
  const t = useMessages().books.preview.reader;
  const slot = (n: number | null, side: Side) =>
    n ? <BookPage key={`${build.fp}:${n}:${reload}`} build={build} n={n} side={side} onFailed={onPageFailed} onLoaded={onPageLoaded} /> : <div aria-hidden className="hidden md:block md:flex-1" />;
  return (
    <section aria-label={t.group} aria-busy={dimmed} className="rounded-2xl border border-line bg-[#e9e4dc] px-4 py-6 sm:px-6 sm:py-8">
      <div className={cn("mx-auto flex max-w-4xl flex-col gap-8 transition-opacity duration-300", dimmed && "opacity-50")}>
        {bookSpreads(build.pageCount).map(([left, right]) => (
          <div
            key={left ?? right}
            data-spread={[left, right].filter(Boolean).join("-")}
            // Оценка высоты ещё не нарисованного разворота: на телефоне полосы друг под другом, на развороте — рядом.
            style={{ "--rows": left && right ? 2 : 1, "--ratio": build.trimMm.h / build.trimMm.w } as CSSProperties}
            className="flex flex-col items-center gap-8 [contain-intrinsic-size:auto_calc(var(--rows)*(min(448px,100vw_-_66px)*var(--ratio)_+_4rem))] [content-visibility:auto] md:flex-row md:items-start md:gap-0 md:[contain-intrinsic-size:auto_calc(min(28rem,50vw_-_50px)*var(--ratio)_+_2rem)]"
          >
            {slot(left, "left")}
            {slot(right, "right")}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Строка состояния сборки (над страницами и над 3D-книгой): идёт обновление или не удалось, с кнопкой повтора. */
export function StatusLine({ tone, children, action, className }: { tone: "busy" | "warn"; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border px-4 py-3 text-sm",
        tone === "busy" ? "border-line bg-white text-ink-soft" : "border-amber-200 bg-amber-50 text-amber-900",
        className,
      )}
    >
      {tone === "busy" ? <LoaderCircle className="size-4 shrink-0 animate-spin" /> : <TriangleAlert className="size-4 shrink-0" />}
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  );
}

/** Кнопка «Попробовать снова»; пока сервер не готов повторять (retryAt) — неактивна, рядом время, когда можно. */
export function RetryButton({ retrying, retryAt, onRetry, className }: { retrying: boolean; retryAt?: number | null; onRetry: () => void; className?: string }) {
  const m = useMessages();
  const locale = useLocale();
  const wait = retryAt ? clock(retryAt, locale) : null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-3 gap-y-1", className)}>
      {wait ? <span className="text-xs">{m.books.preview.reader.retryAt(wait)}</span> : null}
      <button type="button" className="btn btn-outline btn-sm" onClick={onRetry} disabled={retrying || !!wait}>
        {retrying ? <LoaderCircle className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} {m.common.actions.retry}
      </button>
    </span>
  );
}

/** Состояние сборки без запросов: его рисует PageReader и тесты. */
export function PageReaderView({
  bookId,
  state,
  error,
  slow = false,
  retryAt = null,
  retrying = false,
  progress = null,
  onRetry,
  onPageError,
}: {
  bookId: string;
  state: BookBuildState | null;
  error: string | null;
  /** Сборка идёт дольше обычного. */
  slow?: boolean;
  /** Когда сработает повтор упавшей сборки (часы браузера); null — сейчас. */
  retryAt?: number | null;
  retrying?: boolean;
  /** Ход идущей сборки (этап, проценты, сколько осталось); null — неизвестен. */
  progress?: BuildProgress | null;
  onRetry: () => void;
  /** Картинка полосы не загрузилась — сборку, может, заменили: её стоит переспросить. */
  onPageError?: () => void;
}) {
  const m = useMessages();
  const t = m.books.preview.reader;
  const progressLabels = m.orders.order.progress;
  // Пока новая сборка не готова — показываем прошлую (во время сборки — приглушённой); вёрстки HTML здесь нет вовсе.
  const build = state?.status === "ready" ? state.build : (state?.previous ?? null);
  const building = state?.status === "building";
  // Полосы этой сборки, которые не загрузились: несколько — общая строка с повтором всех.
  const [broken, setBroken] = useState<{ fp: string; pages: number[] }>({ fp: "", pages: [] });
  const [reload, setReload] = useState(0);
  const brokenPages = build && broken.fp === build.fp ? broken.pages : [];
  const onPageFailed = (n: number) => {
    if (build) setBroken((b) => (b.fp === build.fp ? (b.pages.includes(n) ? b : { fp: b.fp, pages: [...b.pages, n] }) : { fp: build.fp, pages: [n] }));
    onPageError?.();
  };
  const onPageLoaded = (n: number) => setBroken((b) => (b.pages.includes(n) ? { fp: b.fp, pages: b.pages.filter((p) => p !== n) } : b));
  const retry = <RetryButton retrying={retrying} retryAt={state?.status === "failed" ? retryAt : null} onRetry={onRetry} />;

  const lines: ReactNode[] = [];
  if (building && build) {
    const summary = progressSummary(progress, progressLabels);
    lines.push(
      <StatusLine key="building" tone="busy">
        {slow ? t.slow : t.updating}
        {summary ? <span className="whitespace-nowrap tabular-nums text-muted"> · {summary}</span> : null}
      </StatusLine>,
    );
  }
  else if (state?.status === "failed")
    lines.push(
      <StatusLine key="failed" tone="warn" action={retry}>
        {build ? t.failedStale : t.failed}
      </StatusLine>,
    );
  // Запрос не прошёл: во время сборки опрос повторится сам, после ошибки сборки кнопка уже есть выше.
  if (error)
    lines.push(
      <StatusLine key="error" tone="warn" action={building || state?.status === "failed" ? undefined : retry}>
        {error}
      </StatusLine>,
    );
  if (brokenPages.length > 1)
    lines.push(
      <StatusLine
        key="pages"
        tone="warn"
        action={
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => {
              setBroken({ fp: "", pages: [] });
              setReload((r) => r + 1);
            }}
          >
            <RotateCcw className="size-4" /> {m.common.actions.retry}
          </button>
        }
      >
        {t.pagesFailed}
      </StatusLine>,
    );
  const waiting = !build && (building || (!state && !error));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">
          {t.note}
          {build ? <span className="whitespace-nowrap"> · {t.pages(build.pageCount)}</span> : null}
        </p>
        {state?.status === "ready" ? (
          // download — скачать; браузеры внутри мессенджеров его не знают — откроют файл в новой вкладке.
          <a href={`/api/books/${bookId}/preview`} download target="_blank" rel="noopener" className="btn btn-outline btn-sm">
            <Download className="size-4" /> {t.download}
          </a>
        ) : (
          // Пока сборка не готова, скачивание ждало бы её (или упало) без всякого отклика на странице.
          <button type="button" disabled title={t.downloadWait} className="btn btn-outline btn-sm relative overflow-hidden">
            {/* Пока страницы собираются — кнопка заполняется: сколько готово, видно сразу на ней. */}
            {building && progress?.state === "running" ? <span aria-hidden className="absolute inset-y-0 left-0 bg-wine/15 transition-[width] duration-1000 ease-linear" style={{ width: `${progress.percent}%` }} /> : null}
            <span className="relative inline-flex items-center gap-2">
              <Download className="size-4" /> {t.download}
              {building && progress?.state === "running" ? <span className="tabular-nums">· {progress.percent}%</span> : null}
            </span>
          </button>
        )}
      </div>
      {build ? (
        <div className="relative">
          {/* Строки состояния — поверх страниц, а не над ними: появляясь и пропадая, они не сдвигают страницы (в Safari нет привязки прокрутки). */}
          {lines.length ? (
            <div className="pointer-events-none sticky top-16 z-10 h-0 sm:top-[4.5rem]">
              <div className="pointer-events-auto flex flex-col gap-2 px-3 pt-3">{lines}</div>
            </div>
          ) : null}
          <BookSpreads build={build} dimmed={building} reload={reload} onPageFailed={onPageFailed} onPageLoaded={onPageLoaded} />
        </div>
      ) : lines.length ? (
        <div className="mb-4 flex flex-col gap-2">{lines}</div>
      ) : null}
      {waiting ? (
        <div role="status" aria-live="polite" className="flex min-h-[50vh] flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-[#e9e4dc] px-6 text-center text-sm text-muted">
          <LoaderCircle className="mb-1 size-8 animate-spin" />
          {state ? (
            <>
              <span className="font-medium text-ink-soft">{t.building}</span>
              <span>{slow ? t.slow : t.buildingHint}</span>
              <RenderStatus job={progress} labels={progressLabels} className="w-full max-w-xs text-left" />
            </>
          ) : (
            m.common.actions.loading
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Предпросмотр книги страницами настоящего PDF: картинки полос экранной сборки (тот же рендер, что и файл для
 * скачивания). Пока сборка обновляется после правок — прошлые страницы приглушены, поверх строка состояния.
 */
export function PageReader({ bookId }: { bookId: string }) {
  const { state, error, slow, retryAt, retry, recover } = useBookBuild(bookId);
  const [retrying, setRetrying] = useState(false);
  const progress = useBuildProgress(bookId, state?.status === "building");
  const onRetry = () => {
    setRetrying(true);
    void retry().finally(() => setRetrying(false));
  };
  return <PageReaderView bookId={bookId} state={state} error={error} slow={slow} retryAt={retryAt} retrying={retrying} progress={progress} onRetry={onRetry} onPageError={recover} />;
}
