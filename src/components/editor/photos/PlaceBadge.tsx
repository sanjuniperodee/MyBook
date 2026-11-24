"use client";

import { BookOpen, ChevronRight, EyeOff, Hourglass, Images, MessageSquareText, Sparkles, StickyNote } from "lucide-react";
import { useMessages } from "@/i18n/client";
import type { PhotoPlace } from "@/lib/book/photo-place";
import { cn } from "@/lib/class-names";
import type { PlaceNames } from "./model";

// Подпись места — общая с сервером (приложение): src/components/editor/photos/model.ts.
export { placeText } from "./model";
import { placeText } from "./model";

const ICONS = { answer: MessageSquareText, opener: BookOpen, after: StickyNote, album: Images, off: EyeOff };

/**
 * Подпись под фото: где оно стоит в книге, «· само» у вставших по правилу книги, отдельный значок «на обложке» /
 * «на обороте». С onOpen — кнопка: открывает лист «Где стоит фото».
 */
export function PlaceBadge({
  place,
  names,
  blank,
  marked,
  openerDesign,
  onOpen,
  className,
}: {
  place: PhotoPlace | undefined;
  names: PlaceNames;
  /** Своя книга: «раздел» вместо «ответ». */
  blank: boolean;
  /** У фото отметка «фото главы» (строка photos.opener). */
  marked?: boolean;
  /** В оформлении есть фото главы. */
  openerDesign?: boolean;
  onOpen?: () => void;
  className?: string;
}) {
  const t = useMessages().editor;
  if (!place) return null;
  const text = placeText(place, names, t, blank, { marked, openerDesign });
  const Icon = place.waitingFor ? Hourglass : place.auto && place.kind !== "off" ? Sparkles : ICONS[place.kind];
  const body = (
    <>
      <Icon className={cn("size-3.5 shrink-0", place.waitingFor ? "text-warning" : place.auto || place.kind === "off" ? "text-muted" : "text-wine")} aria-hidden />
      {/* С меткой обложки — перенос строки: в узкой клетке (выбор снимка обложки) метка уходит вниз, а не сжимает подпись до слога. */}
      <span className={cn("line-clamp-2 min-w-0 flex-1 leading-snug", place.onCover && "min-w-[5.5rem]")}>{text}</span>
      {place.onCover ? <span className="shrink-0 rounded-md bg-sunken px-1.5 py-0.5 text-[10px] font-medium text-ink-soft">{place.onCover === "cover" ? t.photoPlace.cover : t.photoPlace.back}</span> : null}
    </>
  );
  const tone = place.auto || place.kind === "off" ? "text-muted" : "text-ink";
  if (!onOpen)
    return (
      <div className={cn("flex items-center gap-1.5 text-xs", place.onCover && "flex-wrap gap-y-0.5", tone, className)} data-place={place.kind}>
        {body}
      </div>
    );
  return (
    <button type="button" onClick={onOpen} aria-label={t.photoPlace.aria(text)} data-place={place.kind} className={cn("flex min-h-11 w-full items-center gap-1.5 rounded-[10px] text-left text-xs hover:bg-sunken active:bg-cream focus-visible:outline-2 focus-visible:outline-wine", place.onCover && "flex-wrap gap-y-0.5", tone, className)}>
      {body}
      <ChevronRight className="size-3.5 shrink-0 text-muted" aria-hidden />
    </button>
  );
}
