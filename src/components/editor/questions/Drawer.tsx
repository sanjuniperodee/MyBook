"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { useMessages } from "@/i18n/client";

/** Боковая панель поверх редактора (оглавление на телефоне, выбор фото): Escape и щелчок мимо закрывают. */
export function Drawer({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title?: string }) {
  const t = useMessages().editor;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-sm flex-col bg-paper shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold">{title ?? t.drawerTitle}</h2>
          <button className="btn btn-ghost btn-sm size-9 px-0" onClick={onClose} aria-label={t.close}>
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
