"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, Star, X } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { apiFetch } from "@/lib/client-api";
import { cn } from "@/lib/class-names";
import { photoUrl } from "@/lib/urls";
import type { PhotoCrop } from "@/lib/book/photo-crop";
import { PanFrame, type FrameShape } from "@/components/editor/PanFrame";
import { ZoomSlider } from "@/components/editor/CropDialog";

/** Фото книги для выбора по главам: размеры, кадр, выбранная глава, снимок начала, вставлено ли в ответ. */
export interface PickPhoto {
  id: string;
  width: number;
  height: number;
  crop: PhotoCrop | null;
  chapter: string | null;
  opener: boolean;
  inAnswer: boolean;
}

/**
 * Фото главы: какие снимки стоят в главе (нажать — добавить или убрать), какой из них — снимок начала главы (звёздочка),
 * и сам снимок начала — его двигают прямо в рамке и приближают. Фото без выбранной главы раскладываются по правилу книги
 * («авто»). Каждое изменение сохраняется сразу; при закрытии страница перечитывает книгу.
 */
export function ChapterPhotosDialog({
  bookId,
  chapterKey,
  chapterTitle,
  shape,
  photos: initial,
  auto,
  autoOpener,
  chapterTitles,
  editable,
  onClose,
}: {
  bookId: string;
  chapterKey: string;
  chapterTitle: string;
  /** Форма снимка начала главы в оформлении; null — оформление без снимка в начале главы. */
  shape: FrameShape | null;
  photos: PickPhoto[];
  /** Фото, которые сейчас в главе (вместе с попавшими туда по правилу книги). */
  auto: string[];
  /** Снимок начала главы сейчас (в том числе выбранный по правилу). */
  autoOpener: string | null;
  /** Названия глав по ключу — подписать фото, выбранные для другой главы. */
  chapterTitles: Record<string, string>;
  editable: boolean;
  onClose: () => void;
}) {
  const t = useMessages().books.pages.chapterPhotos;
  const router = useRouter();
  const [photos, setPhotos] = useState(initial);
  const [error, setError] = useState(false);
  const close = () => {
    router.refresh();
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const save = async (id: string, patch: Partial<Pick<PickPhoto, "chapter" | "opener" | "crop">>) => {
    setPhotos((ps) =>
      ps.map((p) => {
        if (p.id === id) return { ...p, ...patch, ...(patch.chapter === null ? { opener: false } : {}) };
        // Снимок начала у главы один.
        if (patch.opener && p.chapter === chapterKey) return { ...p, opener: false };
        return p;
      }),
    );
    try {
      await apiFetch(`/api/books/${bookId}/photos/${id}`, { method: "PATCH", json: patch });
      setError(false);
    } catch {
      setError(true);
    }
  };

  const free = photos.filter((p) => !p.inAnswer);
  const here = (p: PickPhoto) => p.chapter === chapterKey;
  const openerPhoto = photos.find((p) => here(p) && p.opener) ?? photos.find((p) => p.id === autoOpener && (p.chapter === null || here(p))) ?? null;
  const [crop, setCrop] = useState<PhotoCrop | null>(openerPhoto?.crop ?? null);
  const [cropFor, setCropFor] = useState(openerPhoto?.id ?? null);
  if (openerPhoto && cropFor !== openerPhoto.id) {
    setCropFor(openerPhoto.id);
    setCrop(openerPhoto.crop);
  }
  const shown = crop ?? { x: 0.5, y: 0.3, zoom: 1 };

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="max-h-[94dvh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:rounded-3xl sm:p-6" role="dialog" aria-modal="true" aria-label={t.title(chapterTitle)}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="min-w-0 truncate text-lg font-semibold">{t.title(chapterTitle)}</h2>
          <button type="button" onClick={close} className="rounded-full p-2.5 text-muted hover:bg-cream hover:text-ink" aria-label={t.close}>
            <X className="size-4" />
          </button>
        </div>
        {error ? <p className="mt-2 text-sm text-wine">{t.error}</p> : null}

        {shape ? (
          <section className="mt-4 flex flex-wrap items-center gap-5 rounded-2xl bg-cream/50 p-4">
            {openerPhoto ? (
              <PanFrame
                photo={openerPhoto}
                crop={shown}
                shape={shape}
                width={shape === "page" ? 150 : 190}
                disabled={!editable}
                onChange={setCrop}
                onCommit={(c) => void save(openerPhoto.id, { crop: c })}
              />
            ) : (
              <div className="flex size-[190px] items-center justify-center rounded-full bg-white text-center text-xs text-muted ring-1 ring-line">{t.noOpener}</div>
            )}
            <div className="min-w-[12rem] flex-1 space-y-3">
              <div>
                <div className="font-medium">{t.opener}</div>
                <p className="text-sm text-muted">{openerPhoto ? t.openerHint : t.openerPick}</p>
              </div>
              {openerPhoto ? <ZoomSlider value={shown.zoom} disabled={!editable} onChange={(zoom) => setCrop({ ...shown, zoom })} onCommit={() => void save(openerPhoto.id, { crop: { ...shown } })} /> : null}
            </div>
          </section>
        ) : null}

        <section className="mt-5">
          <div className="font-medium">{t.photos}</div>
          <p className="text-sm text-muted">{shape ? t.photosHintOpener : t.photosHint}</p>
          {free.length ? (
            <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
              {free.map((p) => {
                const mine = here(p);
                const autoHere = !p.chapter && auto.includes(p.id);
                const elsewhere = p.chapter && !mine ? (chapterTitles[p.chapter] ?? "—") : null;
                const isOpener = openerPhoto?.id === p.id;
                return (
                  <li key={p.id} className="relative">
                    <button
                      type="button"
                      disabled={!editable}
                      onClick={() => void save(p.id, { chapter: mine ? null : chapterKey })}
                      className={cn("relative block aspect-square w-full overflow-hidden rounded-xl bg-cream ring-offset-2 transition", mine ? "ring-2 ring-wine" : autoHere ? "ring-2 ring-dashed ring-wine/40" : "ring-1 ring-line hover:ring-ink/30", elsewhere && "opacity-60")}
                      aria-pressed={mine}
                      title={elsewhere ? t.inOther(elsewhere) : mine ? t.remove : t.add}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- фото клиента */}
                      <img src={photoUrl(p.id)} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
                      {mine ? (
                        <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-wine text-white">
                          <Check className="size-3" />
                        </span>
                      ) : null}
                      <span className="absolute inset-x-1 bottom-1 truncate rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] text-white empty:hidden">
                        {elsewhere ? t.inOther(elsewhere) : autoHere ? t.auto : ""}
                      </span>
                    </button>
                    {shape && (mine || autoHere) ? (
                      <button
                        type="button"
                        disabled={!editable}
                        onClick={() => void save(p.id, mine ? { opener: !p.opener } : { chapter: chapterKey, opener: true })}
                        className={cn("absolute top-1.5 left-1.5 flex size-6 items-center justify-center rounded-full shadow", isOpener ? "bg-amber-400 text-white" : "bg-white/90 text-muted hover:text-amber-500")}
                        title={isOpener ? t.isOpener : t.makeOpener}
                        aria-label={isOpener ? t.isOpener : t.makeOpener}
                        aria-pressed={isOpener}
                      >
                        <Star className="size-3.5" fill={isOpener ? "currentColor" : "none"} />
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">{t.empty}</p>
          )}
        </section>
        <div className="mt-5 flex justify-end">
          <button type="button" className="h-10 rounded-full bg-wine px-5 text-sm font-medium text-white hover:opacity-90" onClick={close}>
            {t.done}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
