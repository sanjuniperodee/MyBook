"use client";

import { useState } from "react";
import { BookOpen, FileText } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { Flipbook3D, type FlipbookData } from "@/components/book3d/Flipbook3D";
import { cn } from "@/lib/utils";
import { PreviewFrame } from "./PreviewFrame";

type Tab = "book" | "pdf";

/** 3D-книга для быстрого просмотра и PDF для точной вычитки; PDF собирается, только когда его открыли. */
export function PreviewTabs({ bookId, initialVersion, flipbook }: { bookId: string; initialVersion: number; flipbook: FlipbookData }) {
  const t = useMessages().books.preview;
  const [tab, setTab] = useState<Tab>("book");
  const tabs: { id: Tab; label: string; icon: typeof BookOpen }[] = [
    { id: "book", label: t.tabs.book, icon: BookOpen },
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
          <Flipbook3D data={flipbook} />
        </div>
      ) : (
        <div role="tabpanel" id="preview-panel-pdf" aria-labelledby="preview-tab-pdf">
          <PreviewFrame bookId={bookId} initialVersion={initialVersion} />
        </div>
      )}
    </div>
  );
}
