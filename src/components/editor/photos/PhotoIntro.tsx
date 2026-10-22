"use client";

import { useSyncExternalStore } from "react";
import { Info } from "lucide-react";
import { useMessages } from "@/i18n/client";

const KEY = "mybook:photo-intro";
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const seen = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
};

/** Видел ли автор объяснение «Где стоит фото» (один раз на устройстве); на сервере — да, чтобы карточка не мелькала. */
export function usePhotoIntroSeen(): [boolean, () => void] {
  const value = useSyncExternalStore(subscribe, seen, () => true);
  const dismiss = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
    listeners.forEach((l) => l());
  };
  return [value, dismiss];
}

/**
 * Карточка «Где стоит фото» (mentalModel): у каждого фото одно место, оно подписано под фото, нажмите — и выберите
 * другое. Показывается один раз — в превью, во вкладке «Фото» и в листе места; «Понятно» прячет её везде.
 */
export function PhotoIntroCard({ blank, force, className }: { blank: boolean; /** Показать, даже если уже видели. */ force?: boolean; className?: string }) {
  const t = useMessages().editor.photoIntro;
  const [isSeen, dismiss] = usePhotoIntroSeen();
  if (isSeen && !force) return null;
  return (
    <div className={className ?? "rounded-2xl bg-cream/70 p-4"}>
      <div className="flex items-center gap-2 font-medium">
        <Info className="size-4 shrink-0 text-wine" aria-hidden />
        {t.title}
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{blank ? t.textBlank : t.text}</p>
      {!isSeen ? (
        <button type="button" className="btn btn-outline btn-sm mt-3 min-h-11" onClick={dismiss}>
          {t.ok}
        </button>
      ) : null}
    </div>
  );
}
