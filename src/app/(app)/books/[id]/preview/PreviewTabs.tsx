"use client";

import { useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { Box, BookOpen } from "lucide-react";
import { Link, useMessages } from "@/i18n/client";
import type { FlipbookData } from "@/components/book3d/pages";
import { supportsWebGL } from "@/components/book3d/webgl/support";
import { cn } from "@/lib/class-names";
import { PageReader } from "@/components/book-pages/PageReader";

const placeholder = () => <div className="mx-auto aspect-[5/4] w-full max-w-3xl animate-pulse rounded-[14px] bg-sunken" aria-hidden />;
// Объёмная книга — самый тяжёлый код страницы (Three.js): подгружается отдельным куском и только в браузере.
const BookViewerGL = dynamic(() => import("@/components/book3d/BookViewerGL").then((m) => m.BookViewerGL), { ssr: false, loading: placeholder });
// Запасной вариант без WebGL: та же книга на CSS 3D, с теми же картинками полос.
const BookViewerCss = dynamic(() => import("@/components/book3d/BookViewer3D").then((m) => m.BookViewer3D), { ssr: false, loading: placeholder });

type Tab = "read" | "book";

/**
 * Читалка — страницы макета разворотами с листанием (картинки экранной сборки того же PDF, что уйдёт в типографию),
 * 3D-книга — осмотр со всех сторон. Сборку спрашивает открытая вкладка. orderHref — после последней страницы
 * читалки предлагаем оформить заказ (только у черновика).
 */
export function PreviewTabs({ bookId, flipbook, orderHref }: { bookId: string; flipbook: FlipbookData; orderHref: string | null }) {
  const m = useMessages();
  const t = m.books.preview;
  const rd = m.bookStudio.reader;
  const [tab, setTab] = useState<Tab>("read");
  // WebGL — основной рендерер; если его нет или видеокарта сбросила контекст, показываем CSS-версию.
  const webgl = useSyncExternalStore(
    () => () => {},
    () => supportsWebGL(),
    () => true,
  );
  const [lost, setLost] = useState(false);
  const tabs: { id: Tab; label: string; icon: typeof Box }[] = [
    { id: "read", label: rd.tabs.read, icon: BookOpen },
    { id: "book", label: rd.tabs.model, icon: Box },
  ];
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div role="tablist" className="inline-flex max-w-full rounded-[12px] bg-sunken p-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              id={`preview-tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`preview-panel-${id}`}
              onClick={() => setTab(id)}
              className={cn("flex min-h-11 items-center gap-2 rounded-[10px] px-4 text-sm font-medium transition-colors sm:min-h-9", tab === id ? "bg-white text-ink shadow-soft" : "text-muted hover:text-ink")}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
        <Link href={`/books/${bookId}/cover`} className="text-sm text-wine hover:underline">
          {t.changeCover}
        </Link>
      </div>
      {tab === "read" ? (
        <div role="tabpanel" id="preview-panel-read" aria-labelledby="preview-tab-read">
          <PageReader
            bookId={bookId}
            end={
              orderHref ? (
                <Link href={orderHref} className="btn btn-primary btn-lg">
                  {t.order}
                </Link>
              ) : null
            }
          />
        </div>
      ) : (
        <div role="tabpanel" id="preview-panel-book" aria-labelledby="preview-tab-book">
          {webgl && !lost ? <BookViewerGL data={flipbook} bookId={bookId} onUnsupported={() => setLost(true)} /> : <BookViewerCss data={flipbook} bookId={bookId} />}
        </div>
      )}
    </div>
  );
}
