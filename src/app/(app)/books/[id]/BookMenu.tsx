"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Download, Ellipsis, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/client-api";

export function BookMenu({ bookId, editable }: { bookId: string; editable: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const remove = async () => {
    if (!confirm("Удалить книгу безвозвратно? Все ответы и фото будут стёрты.")) return;
    try {
      await apiFetch(`/api/books/${bookId}`, { method: "DELETE" });
      router.push("/books");
      router.refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  };
  return (
    <div className="relative" ref={ref}>
      <button className="btn btn-outline btn-sm size-11 px-0" aria-label="Ещё" onClick={() => setOpen((v) => !v)}>
        <Ellipsis className="size-5" />
      </button>
      {open ? (
        <div className="absolute right-0 bottom-full z-20 mb-2 w-60 overflow-hidden rounded-2xl border border-line bg-white p-1.5 shadow-lift">
          <a href={`/api/books/${bookId}/export`} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-cream">
            <Download className="size-4" /> Скачать текст книги (.txt)
          </a>
          {editable ? (
            <button onClick={remove} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-red-700 hover:bg-red-50">
              <Trash2 className="size-4" /> Удалить книгу
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
