"use client";

import { useRef, useState } from "react";
import { ImagePlus, Trash2, X } from "lucide-react";
import { confirmDialog, toast } from "@/components/ui/overlays";
import { useMessages } from "@/i18n/client";
import type { PhotoPlace } from "@/lib/book/photo-place";
import { TOC_TITLE_MAX } from "@/lib/book/toc";
import { cn } from "@/lib/class-names";
import { photoUrl } from "@/lib/urls";
import { albumOutTarget, albumPhotos, albumRemoval, galleryTitleOf, withGalleryTitle, type PlaceData, type PlaceEvents, type PlaceTarget } from "./model";
import { PhotoChooser } from "./PhotoChooser";
import { PlaceBadge, placeText } from "./PlaceBadge";
import { PlaceSheet } from "./PlaceSheet";
import { Sheet } from "./Sheet";
import { usePlaceEditing } from "./usePlaceEditing";
import { PHOTO_ACCEPT } from "./api";

/**
 * Лист «Альбом в конце» (S9): что такое альбом, его название в книге (строка оглавления альбома), фото альбома —
 * выбранные автором и вставшие туда сами, — добавить из всех фото или загрузить (загруженное встаёт в альбом, R14),
 * убрать фото (× — туда, где правило книги его не вернёт в альбом), «Убрать альбом» целиком: разложить после глав
 * или не печатать — одна правка книги и один пакет фото, одно «Отменить». Скрыть строку альбома в оглавлении — это
 * по-прежнему только строка оглавления.
 */
export function GallerySheet({ data, on, onClose, layer }: { data: PlaceData; on: PlaceEvents; onClose: () => void; layer?: string }) {
  const m = useMessages();
  const g = m.editor.gallery;
  const cp = m.editor.chapterPhoto;
  const ed = usePlaceEditing(data, on);
  const { book, names } = ed;
  const [choosing, setChoosing] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [placeFor, setPlaceFor] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const saved = ed.tocLines;
  const title = galleryTitleOf(saved, book.galleryTitle);
  const custom = galleryTitleOf(saved, "");
  const [name, setName] = useState(custom);
  // Название поменяли снаружи (или отменили) — поле показывает его, пока автор не начал печатать своё.
  const [shown, setShown] = useState(custom);
  if (shown !== custom) {
    setShown(custom);
    setName(custom);
  }

  const album = albumPhotos(ed.photos, ed.places);
  const noChapters = !data.chapters.some((c) => c.printed);
  const openerDesign = !!ed.design.opener.photo;
  const label = (p: PhotoPlace | undefined) => (p ? placeText(p, names, m.editor, book.blank, { openerDesign }) : "—");
  const toAlbum = (id: string): { id: string; target: PlaceTarget } => ({ id, target: { kind: "album" } });

  const saveName = () => {
    if (name.trim() === custom) return;
    void ed.saveBook({ tocLines: (lines) => withGalleryTitle(lines, name) });
  };

  const removePhoto = (id: string) =>
    void ed.move([{ id, target: albumOutTarget(ed.places.get(id), ed.ctx) }], { toast: (b, a) => m.editor.placeSheet.toast(label(b.get(id)), label(a.get(id))), undoLabel: g.undo });

  const add = async () => {
    const ids = picked;
    const ok = await ed.move(ids.map(toAlbum), { toast: ids.length === 1 ? (b) => m.editor.placeSheet.toast(label(b.get(ids[0])), m.editor.photoPlace.album) : g.toastAdded(ids.length), undoLabel: g.undo });
    if (ok) {
      setPicked([]);
      setChoosing(false);
    }
  };

  const upload = async (files: File[]) => {
    const rows = await ed.upload(files, (list) => list.map((r) => toAlbum(r.id)));
    if (input.current) input.current.value = "";
    if (rows.length) setChoosing(false);
  };

  // «Убрать альбом»: правило книги и выбранные в альбом фото — вместе, и «Отменить» возвращает и то, и другое.
  const removeAlbum = async () => {
    const answer = await confirmDialog({ title: g.removeQ(album.length), confirmLabel: g.toChapters, altLabel: g.none, cancelLabel: g.cancel });
    if (!answer) return;
    const prev = ed.photoPlacement;
    const { photoPlacement, moves } = albumRemoval(answer === "alt" ? "none" : "chapters", ed.photos, ed.places);
    const back = () => ed.saveBook({ photoPlacement: prev }).then(() => undefined);
    if (photoPlacement !== prev && !(await ed.saveBook({ photoPlacement }))) return;
    if (moves.length) {
      const ok = await ed.move(moves, { toast: g.toast, undoLabel: g.undo, also: photoPlacement !== prev ? back : undefined, confirm: false, placement: photoPlacement });
      if (!ok && photoPlacement !== prev) await back();
      return;
    }
    if (photoPlacement !== prev) toast(g.toast, "success", { action: { label: g.undo, run: back } });
  };

  return (
    <Sheet
      title={choosing ? cp.add : g.title(title)}
      onClose={onClose}
      onBack={choosing ? () => (setChoosing(false), setPicked([])) : undefined}
      backLabel={m.editor.placeSheet.back}
      closeLabel={cp.close}
      full
      layer={layer}
      footer={
        choosing ? (
          <div className="flex gap-2">
            <button type="button" className="btn btn-outline flex-1 sm:flex-none" onClick={() => (setChoosing(false), setPicked([]))}>
              {g.cancel}
            </button>
            <button type="button" className="btn btn-primary flex-1" disabled={!picked.length} onClick={() => void add()}>
              {picked.length ? cp.addCount(picked.length) : cp.add}
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-primary w-full" onClick={onClose}>
            {g.done}
          </button>
        )
      }
    >
      <input ref={input} type="file" accept={PHOTO_ACCEPT} multiple className="hidden" onChange={(e) => void upload([...(e.target.files ?? [])])} />
      {ed.error ? <p className="mb-3 text-sm text-wine">{cp.error}</p> : null}
      {ed.note ? <p className="mb-3 text-sm text-amber-800">{ed.note}</p> : null}

      {choosing ? (
        <PhotoChooser
          mode="album"
          photos={ed.photos}
          places={ed.places}
          chapterKey=""
          picked={picked}
          names={names}
          blank={book.blank}
          openerDesign={openerDesign}
          editable={book.editable}
          uploading={ed.uploading}
          onPick={(id) => setPicked((ps) => (ps.includes(id) ? ps.filter((x) => x !== id) : [...ps, id]))}
          onUpload={() => input.current?.click()}
        />
      ) : (
        <>
          <p className="text-sm leading-relaxed text-ink-soft">{g.text}</p>
          {noChapters ? <p className="mt-2 rounded-xl bg-cream/60 px-3 py-2 text-sm text-ink-soft">{book.blank ? g.noChaptersBlank : g.noChapters}</p> : null}

          <label className="mt-4 block">
            <span className="label">{g.field}</span>
            <input
              className="input"
              value={name}
              placeholder={book.galleryTitle}
              maxLength={TOC_TITLE_MAX}
              disabled={!book.editable}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
          </label>

          <section className="mt-5" aria-label={m.editor.photoPlace.album}>
            {album.length ? (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {album.map((p) => {
                  const place = ed.places.get(p.id);
                  const auto = !!place?.auto;
                  return (
                    <li key={p.id}>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setPlaceFor(p.id)}
                          aria-label={m.editor.photoPlace.aria(label(place))}
                          className={cn("relative block aspect-square w-full overflow-hidden rounded-xl bg-cream", auto ? "ring-2 ring-dashed ring-wine/40" : "ring-1 ring-line")}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- фото клиента */}
                          <img src={photoUrl(p.id)} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
                        </button>
                        {auto ? <span className="absolute top-1.5 left-1.5 rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-ink-soft">{cp.autoChip}</span> : null}
                        {book.editable ? (
                          <button
                            type="button"
                            onClick={() => removePhoto(p.id)}
                            className="absolute -top-1.5 -right-1.5 flex size-9 items-center justify-center rounded-full bg-white text-muted shadow ring-1 ring-line hover:text-ink"
                            aria-label={g.removePhotoAria}
                          >
                            <X className="size-4" />
                          </button>
                        ) : null}
                      </div>
                      <PlaceBadge place={place} names={names} blank={book.blank} marked={p.opener} openerDesign={openerDesign} onOpen={() => setPlaceFor(p.id)} className="mt-1" />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{g.empty}</p>
            )}
            {book.editable ? (
              <button type="button" className="btn btn-outline mt-4 w-full sm:w-auto" onClick={() => setChoosing(true)}>
                <ImagePlus className="size-4" /> {cp.add}
              </button>
            ) : null}
          </section>

          {book.editable && album.length ? (
            <button type="button" className="mt-6 flex min-h-11 items-center gap-2 rounded-lg px-1 text-sm font-medium text-wine hover:bg-wine/5" onClick={() => void removeAlbum()}>
              <Trash2 className="size-4" /> {g.remove}
            </button>
          ) : null}
        </>
      )}

      {placeFor ? <PlaceSheet data={ed.view} on={ed.relay} photoId={placeFor} onClose={() => setPlaceFor(null)} /> : null}
    </Sheet>
  );
}
