"use client";

import type { BackContent } from "@/lib/book/cover-back";
import type { PhotoRef } from "@/lib/book/covers/svg-kit";

import { useState } from "react";
import type { CoverPreviewProps } from "@/components/cover/CoverPreview";
import { RetryButton as RetryControl, StatusLine } from "@/components/book-pages/PageReader";
import { useBookBuild } from "@/components/book-pages/useBookBuild";
import { useMessages } from "@/i18n/client";
import { pageImageUrl, type BookBuild, type BookBuildState, type PageImageWidth } from "@/lib/book/book-build";

/**
 * Что 3D-книге нужно, кроме полос, одними сериализуемыми данными (страница-сервер → клиентский компонент):
 * обложка, оборот и формат. Полосы — картинки экранной сборки (тот же PDF, что для типографии), их книга
 * спрашивает сама (useFlipbookPages); толщина корешка — по числу полос этой сборки.
 */
export interface FlipbookData {
  cover: Pick<CoverPreviewProps, "template" | "format" | "title" | "subtitle" | "names" | "photos" | "titlePlaceholder" | "photoHint" | "design">;
  formatId: string;
  /** Название книги, как в PDF: на корешке, если на обложке его нет. */
  title: string;
  model: { brand: string; back: BackContent; backPhotos?: (PhotoRef | undefined)[] };
}

export interface FlipbookPages {
  state: BookBuildState | null;
  /** Последний запрос сборки не прошёл — текст на языке страницы. */
  error: string | null;
  /** Чьи полосы на листах: готовая сборка или, пока новая собирается (или не собралась), прошлая; null — ещё нечего. */
  build: BookBuild | null;
  /** Сборка идёт дольше обычного. */
  slow?: boolean;
  /** Когда сработает повтор упавшей сборки (часы браузера); null — сейчас. */
  retryAt?: number | null;
  retrying: boolean;
  retry: () => void;
  /** Картинки полос не грузятся — переспросить сборку (её могли заменить); сам не чаще раза в несколько секунд. */
  recover?: () => void;
  /** Картинки полос сборки не грузятся и после повторов — строка с повтором над книгой. */
  pagesFailed?: boolean;
}

/** Экранная сборка для 3D-книги: пока новая не готова — листаем прошлую. */
export function useFlipbookPages(bookId: string): Omit<FlipbookPages, "pagesFailed"> {
  const { state, error, slow, retryAt, retry: ask, recover } = useBookBuild(bookId);
  const [retrying, setRetrying] = useState(false);
  const build = state?.status === "ready" ? state.build : (state?.previous ?? null);
  const retry = () => {
    setRetrying(true);
    void ask().finally(() => setRetrying(false));
  };
  return { state, error, build, slow, retryAt, retrying, retry, recover };
}

/**
 * Развороты в каждую сторону от читаемого, полосы которых держим загруженными: следующий переворот открывает
 * соседний разворот, через один — запас на быстрое листание. Дальше не грузим: на iPhone память кончается раньше.
 */
export const NEAR_SPREADS = 2;

/** Ширина картинки полосы на листе: на телефоне меньше — окно разворотов должно уместиться в его память. */
export const leafImageWidth = (): PageImageWidth => (typeof window !== "undefined" && Math.min(window.innerWidth, window.innerHeight) < 700 ? 800 : 1200);

/** Картинка полосы n; null — пустая полоса добивки (лист чистый, картинка не нужна) или полосы нет. */
export function leafImage(build: BookBuild, n: number, width: PageImageWidth): string | null {
  const page = build.pages[n - 1];
  return page && page.kind !== "pad" ? pageImageUrl(build, n, width) : null;
}

function RetryButton({ pages, onClick }: { pages: FlipbookPages; onClick?: () => void }) {
  return (
    // Нажатие не уходит сцене CSS-версии: она захватывает указатель для вращения, и щелчок достался бы ей, а не кнопке.
    <span className="pointer-events-auto" onPointerDown={(e) => e.stopPropagation()}>
      <RetryControl retrying={pages.retrying} retryAt={pages.state?.status === "failed" ? pages.retryAt : null} onRetry={onClick ?? pages.retry} />
    </span>
  );
}

/**
 * Поверх книги (сверху в кадре, а не над ним — появляясь, строка не сдвигает книгу под пальцем), когда листаем прошлую
 * сборку: новая собирается после правок или не собралась; запрос не прошёл; картинки полос не грузятся.
 */
export function BuildNotice({ pages, onReloadPages }: { pages: FlipbookPages; onReloadPages?: () => void }) {
  const t = useMessages().books.preview.reader;
  const { state, error, build } = pages;
  if (!build) return null;
  const waiting = state?.status === "building" || state?.status === "failed";
  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-col gap-2">
      {state?.status === "building" ? <StatusLine tone="busy">{pages.slow ? t.slow : t.updating}</StatusLine> : null}
      {state?.status === "failed" ? (
        <StatusLine tone="warn" action={<RetryButton pages={pages} />}>
          {t.failedStale}
        </StatusLine>
      ) : null}
      {/* Во время сборки опрос повторится сам, после ошибки сборки кнопка уже есть выше. */}
      {error ? (
        <StatusLine tone="warn" action={waiting ? undefined : <RetryButton pages={pages} />}>
          {error}
        </StatusLine>
      ) : null}
      {pages.pagesFailed && !error ? (
        <StatusLine tone="warn" action={<RetryButton pages={{ ...pages, retrying: false, retryAt: null }} onClick={onReloadPages} />}>
          {t.pagesFailed}
        </StatusLine>
      ) : null}
    </div>
  );
}

/** Вместо книги, пока листать нечего: первая сборка идёт, ответа ещё нет или сборка не удалась. */
export function BuildPlaceholder({ pages }: { pages: FlipbookPages }) {
  const m = useMessages().books.preview;
  const { state, error } = pages;
  const failed = state?.status === "failed" || (!state && !!error);
  return (
    <div role="status" aria-live="polite" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted">
      {failed ? (
        <>
          <span className="font-medium text-ink-soft">{state?.status === "failed" ? m.reader.failed : error}</span>
          <RetryButton pages={pages} />
        </>
      ) : (
        <>
          <span>{m.flip.loading}</span>
          {state?.status === "building" ? <span>{pages.slow ? m.reader.slow : m.reader.buildingHint}</span> : null}
        </>
      )}
    </div>
  );
}
