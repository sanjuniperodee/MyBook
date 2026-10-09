"use client";

import { useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { Box, FileText } from "lucide-react";
import { useMessages } from "@/i18n/client";
import type { FlipbookData } from "@/components/book3d/pages";
import { supportsWebGL } from "@/components/book3d/webgl/support";
import { cn } from "@/lib/utils";
import { PreviewFrame } from "./PreviewFrame";

const placeholder = () => <div className="mx-auto aspect-[5/4] w-full max-w-3xl animate-pulse rounded-3xl bg-cream" aria-hidden />;
// Объёмная книга — самый тяжёлый код страницы (Three.js): подгружается отдельным куском и только в браузере.
const BookViewerGL = dynamic(() => import("@/components/book3d/BookViewerGL").then((m) => m.BookViewerGL), { ssr: false, loading: placeholder });
// Запасной вариант без WebGL: та же книга на CSS 3D.
const BookViewerCss = dynamic(() => import("@/components/book3d/BookViewer3D").then((m) => m.BookViewer3D), { ssr: false, loading: placeholder });

type Tab = "book" | "pdf";

/** 3D-книга — осмотр со всех сторон и чтение с листанием, PDF — точная вычитка; PDF собирается, только когда его открыли. */
export function PreviewTabs({ bookId, initialVersion, flipbook }: { bookId: string; initialVersion: number; flipbook: FlipbookData }) {
  const t = useMessages().books.preview;
  const [tab, setTab] = useState<Tab>("book");
  // WebGL — основной рендерер; если его нет или видеокарта сбросила контекст, показываем CSS-версию.
  const webgl = useSyncExternalStore(
    () => () => {},
    () => supportsWebGL(),
    () => true,
  );
  const [lost, setLost] = useState(false);
  const tabs: { id: Tab; label: string; icon: typeof Box }[] = [
    { id: "book", label: t.tabs.book, icon: Box },
    { id: "pdf", label: t.tabs.pdf, icon: FileText },
  ];
  return (
    <div>
      <div role="tablist" className="mb-5 inline-flex rounded-full border border-line bg-white p-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            id={`preview-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`preview-panel-${id}`}
            onClick={() => setTab(id)}
            className={cn("flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors", tab === id ? "bg-wine text-white" : "text-ink-soft hover:bg-cream")}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>
      {tab === "book" ? (
        <div role="tabpanel" id="preview-panel-book" aria-labelledby="preview-tab-book">
          {webgl && !lost ? <BookViewerGL data={flipbook} onUnsupported={() => setLost(true)} /> : <BookViewerCss data={flipbook} />}
        </div>
      ) : (
        <div role="tabpanel" id="preview-panel-pdf" aria-labelledby="preview-tab-pdf">
          <PreviewFrame bookId={bookId} initialVersion={initialVersion} />
        </div>
      )}
    </div>
  );
}
