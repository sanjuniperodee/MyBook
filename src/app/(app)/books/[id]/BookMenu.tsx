"use client";

import { confirmDialog, toast, toastError } from "@/components/ui/overlays";
import { useEffect, useRef, useState } from "react";
import { Download, Ellipsis, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { useLocaleRouter, useMessages } from "@/i18n/client";

export function BookMenu({ bookId, editable }: { bookId: string; editable: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useLocaleRouter();
  const t = useMessages().books.menu;

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const remove = async () => {
    if (!(await confirmDialog({ title: t.deleteTitle, text: t.deleteText, confirmLabel: t.delete, danger: true }))) return;
    try {
      await apiFetch(`/api/books/${bookId}`, { method: "DELETE" });
      toast(t.deleted);
      router.push("/books");
      router.refresh();
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div className="relative" ref={ref}>
      <button className="btn btn-outline btn-sm size-11 px-0" aria-label={t.more} onClick={() => setOpen((v) => !v)}>
        <Ellipsis className="size-5" />
      </button>
      {open ? (
        <div className="absolute right-0 bottom-full z-20 mb-2 w-60 overflow-hidden rounded-2xl border border-line bg-white p-1.5 shadow-lift">
          <a href={`/api/books/${bookId}/export`} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-cream">
            <Download className="size-4" /> {t.exportTxt}
          </a>
          {editable ? (
            <button onClick={remove} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-red-700 hover:bg-red-50">
              <Trash2 className="size-4" /> {t.delete}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
