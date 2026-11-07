"use client";

import { PageTurn, turnPage } from "@/components/motion/PageTurn";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Download, LayoutList, LoaderCircle, Maximize2, Minimize2, RotateCcw, TriangleAlert } from "lucide-react";
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

export function BookPage({ build, n, side, onFailed, onLoaded }: { build: BookBuild; n: number; side: Side; onFailed?: (n: number) => void; onLoaded?: (n: number) => void }) {
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
            data-help={`page:${n}`}
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
    <section aria-label={t.group} aria-busy={dimmed} className="rounded-[14px] border border-line bg-sunken px-4 py-6 sm:px-6 sm:py-8">
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

/** Широкий экран (планшет и выше): разворот из двух полос; уже — по одной полосе. */
const WIDE = "(min-width: 768px)";
const subscribeWide = (cb: () => void) => {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/**
 * Читалка: один разворот на экране (на телефоне — одна полоса), листание стрелками, свайпом и ползунком, на весь экран.
 * Соседние полосы подгружаются заранее. После последней — слот end (заказ). Страницы — те же картинки сборки, что в ленте.
 */
export function SpreadViewer({
  build,
  dimmed = false,
  reload = 0,
  onPageFailed,
  onPageLoaded,
  end,
}: {
  build: BookBuild;
  dimmed?: boolean;
  reload?: number;
  onPageFailed?: (n: number) => void;
  onPageLoaded?: (n: number) => void;
  end?: ReactNode;
}) {
  const m = useMessages();
  const t = m.books.preview;
  const rd = m.bookStudio.reader;
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => true);
  const [page, setPage] = useState(1);
  const stage = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const swipe = useRef<number | null>(null);
  // Свайп уже перелистнул — щелчок, который браузер пришлёт следом, страницу не листает.
  const swiped = useRef(false);

  // Единицы листания: развороты или отдельные полосы; текущая единица — та, где лежит страница page.
  const units = useMemo<Spread[]>(() => (wide ? bookSpreads(build.pageCount) : Array.from({ length: build.pageCount }, (_, i): Spread => [null, i + 1])), [wide, build.pageCount]);
  const current = Math.min(page, build.pageCount);
  const index = Math.max(0, units.findIndex((u) => u[0] === current || u[1] === current));
  const [left, right] = units[index] ?? [null, null];
  // Листание — переходом с направлением: правая страница переворачивается вокруг корешка (PageTurn).
  const go = (i: number) => {
    const to = Math.min(units.length - 1, Math.max(0, i));
    const u = units[to];
    if (!u || to === index) return;
    turnPage(to > index ? "page-forward" : "page-back", () => setPage((u[0] ?? u[1]) as number));
  };

  // Соседние развороты — в кеш браузера заранее, чтобы листание не ждало сети.
  useEffect(() => {
    for (const u of [units[index - 1], units[index + 1]]) for (const n of u ?? []) if (n) new Image().src = pageImageUrl(build, n, 800);
  }, [units, index, build]);
  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === stage.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "PageDown") go(index + 1);
    else if (e.key === "ArrowLeft" || e.key === "PageUp") go(index - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(units.length - 1);
    else return;
    e.preventDefault();
  };
  const onUp = (e: PointerEvent) => {
    const from = swipe.current;
    swipe.current = null;
    if (from === null) return;
    const dx = e.clientX - from;
    if (Math.abs(dx) > 48) {
      swiped.current = true;
      go(index + (dx < 0 ? 1 : -1));
    }
  };
  /** Щелчок по левой или правой половине разворота — назад или вперёд, как в книге. */
  const tap = (step: -1 | 1) => () => {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    go(index + step);
  };
  // Разворот целиком в окне: ширина — по высоте сцены (две полосы на компьютере, одна на телефоне).
  const ratio = ((wide ? 2 : 1) * build.trimMm.w) / build.trimMm.h;
  const label = t.flip.pages(left, right);
  const last = index >= units.length - 1;
  // Одиночная полоса (телефон) листается как правая страница.
  const slot = (n: number | null, side: Side) => (
    <PageTurn key={`${side}:${n ?? "empty"}`} side={wide ? side : "right"}>
      {n ? <BookPage key={`${build.fp}:${n}:${reload}`} build={build} n={n} side={side} onFailed={onPageFailed} onLoaded={onPageLoaded} /> : <div aria-hidden className="hidden md:block md:flex-1" />}
    </PageTurn>
  );

  return (
    <section aria-label={t.reader.group} aria-busy={dimmed} className="space-y-3">
      <div
        ref={stage}
        tabIndex={0}
        onKeyDown={onKey}
        onPointerDown={(e) => (swipe.current = e.clientX)}
        onPointerUp={onUp}
        onPointerCancel={() => (swipe.current = null)}
        style={{ containerType: "size" }}
        className={cn(
          "group/stage relative flex h-[max(22rem,calc(100dvh-19rem))] touch-pan-y items-center justify-center rounded-[14px] border border-line bg-sunken outline-none select-none focus-visible:ring-2 focus-visible:ring-wine/40 md:h-[max(26rem,calc(100dvh-21.5rem))]",
          full && "h-dvh! rounded-none border-0",
        )}
      >
        <div
          className={cn("flex flex-row items-start transition-opacity duration-300", dimmed && "opacity-50")}
          style={{ width: `min(calc(100cqw - 2.5rem), calc((100cqh - 2.5rem) * ${ratio}))` }}
          data-spread={[left, right].filter(Boolean).join("-")}
        >
          {slot(left, "left")}
          {slot(right, "right")}
        </div>
        {/* Листать можно, нажав на страницу: левая половина — назад, правая — вперёд; стрелка у края подсказывает. */}
        <button type="button" tabIndex={-1} aria-hidden onClick={tap(-1)} disabled={index <= 0} className="group/prev absolute inset-y-0 left-0 w-1/2 cursor-w-resize disabled:cursor-default">
          <span className="absolute top-1/2 left-3 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow-soft transition-opacity group-disabled/prev:hidden pointer-coarse:opacity-70 pointer-fine:opacity-0 pointer-fine:group-hover/prev:opacity-100">
            <ChevronLeft className="size-5" />
          </span>
        </button>
        <button type="button" tabIndex={-1} aria-hidden onClick={tap(1)} disabled={last} className="group/next absolute inset-y-0 right-0 w-1/2 cursor-e-resize disabled:cursor-default">
          <span className="absolute top-1/2 right-3 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow-soft transition-opacity group-disabled/next:hidden pointer-coarse:opacity-70 pointer-fine:opacity-0 pointer-fine:group-hover/next:opacity-100">
            <ChevronRight className="size-5" />
          </span>
        </button>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <button type="button" className="btn btn-outline btn-icon shrink-0" onClick={() => go(index - 1)} disabled={index <= 0} aria-label={t.flip.prev}>
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <input type="range" min={0} max={Math.max(0, units.length - 1)} value={index} onChange={(e) => go(Number(e.target.value))} aria-label={t.flip.slider} aria-valuetext={label} className="h-11 min-w-0 flex-1 accent-wine" />
        <button type="button" className="btn btn-outline btn-icon shrink-0" onClick={() => go(index + 1)} disabled={last} aria-label={t.flip.next}>
          <ChevronRight className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon shrink-0 max-md:hidden"
          aria-label={full ? t.flip.exitFullscreen : t.flip.fullscreen}
          onClick={() => (full ? document.exitFullscreen() : stage.current?.requestFullscreen?.())}
        >
          {full ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />}
        </button>
      </div>
      <p className="text-center text-sm text-muted tabular-nums" aria-live="polite">
        {label} {rd.of(build.pageCount)}
      </p>
      <p className="text-center text-xs text-muted max-md:hidden">{rd.hint}</p>
      {last && end ? (
        <div className="mt-2 rounded-[14px] border border-line bg-white p-5 text-center sm:p-6">
          <h3 className="font-serif text-2xl font-medium">{rd.endTitle}</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">{rd.endText}</p>
          <div className="mt-4 flex justify-center">{end}</div>
        </div>
      ) : null}
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
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[14px] border px-4 py-3 text-sm",
        tone === "busy" ? "border-line bg-white text-ink-soft" : "border-warning/30 bg-warning-bg text-warning",
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
  mode = "scroll",
  onMode,
  end,
  lead,
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
  /** scroll — все развороты подряд; spread — по одному развороту со стрелками (читалка). */
  mode?: "scroll" | "spread";
  /** Переключатель вида; нет — переключателя нет. */
  onMode?: (mode: "scroll" | "spread") => void;
  /** Что показать после последней страницы читалки (заказ). */
  end?: ReactNode;
  /** Начало панели над страницами (вкладки «Читать / 3D-книга» и т. п.): одна строка вместо двух, развороту — место. */
  lead?: ReactNode;
}) {
  const m = useMessages();
  const t = m.books.preview.reader;
  const rd = m.bookStudio.reader;
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        {lead}
        <p className={cn("max-w-2xl text-sm text-muted", lead && "max-md:hidden")}>
          {mode === "spread" ? null : t.note}
          {build ? <span className="whitespace-nowrap">{mode === "spread" ? "" : " · "}{t.pages(build.pageCount)}</span> : null}
        </p>
        {onMode ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onMode(mode === "spread" ? "scroll" : "spread")} aria-label={mode === "spread" ? rd.scrollMode : rd.spreadMode}>
            {mode === "spread" ? <LayoutList className="size-4" aria-hidden /> : <BookOpen className="size-4" aria-hidden />}
            <span className="max-sm:hidden">{mode === "spread" ? rd.scrollMode : rd.spreadMode}</span>
          </button>
        ) : null}
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
          {mode === "spread" ? (
            <SpreadViewer build={build} dimmed={building} reload={reload} onPageFailed={onPageFailed} onPageLoaded={onPageLoaded} end={end} />
          ) : (
            <BookSpreads build={build} dimmed={building} reload={reload} onPageFailed={onPageFailed} onPageLoaded={onPageLoaded} />
          )}
        </div>
      ) : lines.length ? (
        <div className="mb-4 flex flex-col gap-2">{lines}</div>
      ) : null}
      {mode === "spread" && build ? <p className="mt-4 max-w-3xl text-xs leading-relaxed text-muted">{t.note}</p> : null}
      {waiting ? (
        <div role="status" aria-live="polite" className="flex min-h-[50vh] flex-col items-center justify-center gap-2 rounded-[14px] border border-line bg-sunken px-6 text-center text-sm text-muted">
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
export function PageReader({ bookId, end, lead }: { bookId: string; end?: ReactNode; lead?: ReactNode }) {
  const { state, error, slow, retryAt, retry, recover } = useBookBuild(bookId);
  const [retrying, setRetrying] = useState(false);
  const [mode, setMode] = useState<"scroll" | "spread">("spread");
  const progress = useBuildProgress(bookId, state?.status === "building");
  const onRetry = () => {
    setRetrying(true);
    void retry().finally(() => setRetrying(false));
  };
  return <PageReaderView bookId={bookId} state={state} error={error} slow={slow} retryAt={retryAt} retrying={retrying} progress={progress} onRetry={onRetry} onPageError={recover} mode={mode} onMode={setMode} end={end} lead={lead} />;
}
