"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Ellipsis, Trash2 } from "lucide-react";
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

  if (!editable) return null;
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
        <div className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-2xl border border-line bg-white p-1.5 shadow-lift">
          <button onClick={remove} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-red-700 hover:bg-red-50">
            <Trash2 className="size-4" /> Удалить книгу
          </button>
        </div>
      ) : null}
    </div>
  );
}
