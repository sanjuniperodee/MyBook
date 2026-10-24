"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, LoaderCircle, Pin, X } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import { useMessages } from "@/i18n/client";
import { OpenerPage } from "@/components/interior/pages";
import { pageKit } from "@/components/interior/kit";
import { cqwUnits } from "@/components/interior/units";
import { getFormat } from "@/lib/book/formats";
import { interiorDesigns } from "@/lib/book/interiors";
import { effectiveDpi } from "@/lib/book/layout";
import { SUGGEST_MIN_DPI } from "@/lib/book/opener-suggest";
import { cropOr, type PhotoCrop } from "@/lib/book/photo-crop";
import { OPENER_FOCUS, openerFrame, type PlaceFrame } from "@/lib/book/photo-pages";
import type { PhotoPlace } from "@/lib/book/photo-place";
import { cn } from "@/lib/class-names";
import { photoUrl } from "@/lib/urls";
import { ZoomSlider } from "../CropDialog";
import { PanFrame } from "../PanFrame";
import { noOpenerPhotoOf, openerOf, reorderWithin, withNoOpenerPhoto, type PlaceData, type PlaceEvents, type PlaceTarget } from "./model";
import { placeText } from "./PlaceBadge";
import { PhotoChooser, type ChooserMode } from "./PhotoChooser";
import { PlaceSheet } from "./PlaceSheet";
import { Sheet } from "./Sheet";
import { usePlaceEditing } from "./usePlaceEditing";
import { PHOTO_ACCEPT } from "./api";

/** Мало точек для рамки: чёткость в кадре с приближением ниже SUGGEST_MIN_DPI. */
export const lowResIn = (photo: { width: number; height: number }, frame: Pick<PlaceFrame, "w" | "h">, zoom = 1) => effectiveDpi(photo, { w: frame.w, h: frame.h }, "cover") / zoom < SUGGEST_MIN_DPI;

/**
 * Лист «Фото главы» (S1): начало главы — живая мини-страница и рамка оформления (круг, арка, на всю страницу, под
 * обрез, паспарту, полароид — openerFrame по текущим оформлению и формату), выбор фото с подсказкой «подходит по
 * форме», «Без фото» (глава начнётся со страницы с названием; отметка noOpenerPhoto в строке главы); ниже — фото
 * после главы: добавить, убрать, закрепить вставшие сами, переставить. Фото главы ставит только автор. В оформлении
 * без фото главы вместо рамки — объяснение и ссылка на выбор оформления. Загруженное здесь встаёт в эту главу (R14).
 * Подписи здесь нет: фото главы печатается без неё.
 */
export function ChapterPhotoSheet({
  data,
  on,
  chapterKey,
  fit,
  choose,
  focus,
  onChangeDesign,
  printedPage,
  onClose,
}: {
  data: PlaceData;
  on: PlaceEvents;
  chapterKey: string;
  /** Лучшие кандидаты в фото главы (suggestOpener), по порядку: чип «подходит по форме». */
  fit?: readonly string[];
  /** Сразу открыть выбор: фото главы или фото после главы. */
  choose?: ChooserMode;
  /** Прокрутить к разделу (нажали на страницу фото после главы в превью). */
  focus?: "after";
  /** «Сменить оформление» в оформлении без фото главы. */
  onChangeDesign?: () => void;
  /**
   * «Как напечатается»: картинка начальной полосы из готовой сборки (BookBuild.chapterPages[key]) — строка; null —
   * сборка для последних правок ещё идёт («Готовим страницу…»); нет — вызывающий сборку не следит, блока нет.
   */
  printedPage?: string | null;
  onClose: () => void;
}) {
  const m = useMessages();
  const cp = m.editor.chapterPhoto;
  const ed = usePlaceEditing(data, on);
  const { book, design, names } = ed;
  const [chooser, setChooser] = useState<ChooserMode | null>(choose ?? null);
  const [picked, setPicked] = useState<string[]>([]);
  const [placeFor, setPlaceFor] = useState<string | null>(null);
  const afterRef = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const uploadFor = useRef<ChooserMode>("opener");

  const format = getFormat(book.format);
  const frame = openerFrame(format, design);
  const chapter = data.chapters.find((c) => c.key === chapterKey);
  const title = chapter?.title ?? names.chapter(chapterKey);
  const opener = openerOf(ed.places, chapterKey);
  const openerPhoto = opener ? ed.photos.find((p) => p.id === opener.id) : undefined;
  const noneChosen = noOpenerPhotoOf(ed.tocLines, chapterKey);
  const after = ed.photos.filter((p) => {
    const pl = ed.places.get(p.id);
    return pl?.kind === "after" && pl.chapterKey === chapterKey;
  });
  const pinned = after.filter((p) => !ed.places.get(p.id)?.auto);
  const autoAfter = after.filter((p) => ed.places.get(p.id)?.auto);

  // Кадр фото главы: двигается сразу, сохраняется, когда отпустили; другое фото — его кадр.
  const [crop, setCrop] = useState<{ id: string | null; value: PhotoCrop | null }>({ id: openerPhoto?.id ?? null, value: openerPhoto?.crop ?? null });
  if ((openerPhoto?.id ?? null) !== crop.id) setCrop({ id: openerPhoto?.id ?? null, value: openerPhoto?.crop ?? null });
  const shown = cropOr(crop.value, OPENER_FOCUS);
  const [frameW] = useState(() => (typeof window === "undefined" ? 200 : Math.round(Math.max(140, Math.min(240, (window.innerWidth - 32) * 0.58, window.innerHeight * 0.4 * (frame?.ratio ?? 1))))));

  useEffect(() => {
    if (focus === "after") afterRef.current?.scrollIntoView({ block: "start" });
  }, [focus]);

  const toAfter = (id: string): { id: string; target: PlaceTarget } => ({ id, target: { kind: "after", chapterKey } });
  const label = (p: PhotoPlace | undefined) => (p ? placeText(p, names, m.editor, book.blank, { openerDesign: !!frame }) : "—");
  // Отметка «без фото» правится по последним строкам оглавления: «Отменить» в тосте срабатывает позже.
  const setNone = (value: boolean) => ed.saveBook({ tocLines: (lines) => withNoOpenerPhoto(lines, chapterKey, value) });
  const clearNone = () => (noneChosen ? setNone(false) : Promise.resolve(true));

  const pickOpener = async (id: string) => {
    const wasNone = noneChosen;
    const ok = await ed.move([{ id, target: { kind: "opener", chapterKey } }], { toast: cp.toastSet, undoLabel: cp.undo, ...(wasNone ? { also: () => setNone(true).then(() => undefined) } : {}) });
    if (!ok) return;
    setChooser(null);
    await clearNone();
  };

  // «Без фото»: выбранное фото остаётся после главы (его можно сразу и не печатать), глава начнётся с названия.
  const none = async () => {
    if (opener) {
      const id = opener.id;
      const ok = await ed.move([toAfter(id)], {
        toast: cp.toastNone,
        undoLabel: cp.undo,
        also: () => setNone(false).then(() => undefined),
        alt: () => ({ label: cp.toastNoneOff, run: () => ed.move([{ id, target: { kind: "off" } }], { toast: (b, a) => m.editor.placeSheet.toast(label(b.get(id)), label(a.get(id))), undoLabel: cp.undo }) }),
      });
      if (ok) await setNone(true);
      return;
    }
    // Фото главы нет — остаётся только решение автора: больше не предлагать.
    if (await setNone(true)) toast(m.editor.chapterStart.toastNone, "success", { action: { label: cp.undo, run: () => setNone(false) } });
  };

  const addAfter = async () => {
    const ids = picked;
    const ok = await ed.move(ids.map(toAfter), { toast: ids.length === 1 ? (b) => m.editor.placeSheet.toast(label(b.get(ids[0])), m.editor.photoPlace.after(title)) : cp.toastAdded(ids.length), undoLabel: cp.undo });
    if (ok) {
      setPicked([]);
      setChooser(null);
    }
  };

  const upload = async (files: File[]) => {
    const mode = uploadFor.current;
    const rows = await ed.upload(files, (list) => (mode === "opener" && frame && list.length ? [{ id: list[0].id, target: { kind: "opener" as const, chapterKey } }, ...list.slice(1).map((r) => toAfter(r.id))] : list.map((r) => toAfter(r.id))));
    if (input.current) input.current.value = "";
    if (rows.length && mode === "opener" && frame) {
      setChooser(null);
      await clearNone();
    } else if (rows.length) setChooser(null);
  };
  const openUpload = (mode: ChooserMode) => {
    uploadFor.current = mode;
    input.current?.click();
  };

  const moveInList = (id: string, step: -1 | 1) => {
    const ids = reorderWithin(
      ed.photos.map((p) => p.id),
      pinned.map((p) => p.id),
      id,
      step,
    );
    if (ids) void ed.reorder(ids);
  };

  const designName = m.catalog.interiors[design.id].name;
  const photoDesigns = interiorDesigns.filter((d) => d.opener.photo).map((d) => m.catalog.interiors[d.id].name);

  const chooserView = chooser ? (
    <PhotoChooser
      mode={chooser}
      photos={ed.photos}
      places={ed.places}
      chapterKey={chapterKey}
      fit={fit}
      picked={picked}
      names={names}
      blank={book.blank}
      openerDesign={!!frame}
      editable={book.editable}
      uploading={ed.uploading}
      onPick={(id) => (chooser === "opener" ? void pickOpener(id) : setPicked((ps) => (ps.includes(id) ? ps.filter((x) => x !== id) : [...ps, id])))}
      onUpload={() => openUpload(chooser)}
    />
  ) : null;

  return (
    <Sheet
      title={chooser === "after" ? cp.add : chooser === "opener" && openerPhoto ? cp.grid : cp.title(title)}
      onClose={onClose}
      onBack={chooser && (chooser === "after" || openerPhoto) ? () => (setChooser(null), setPicked([])) : undefined}
      backLabel={m.editor.placeSheet.back}
      closeLabel={cp.close}
      full
      footer={
        chooser === "after" ? (
          <div className="flex gap-2">
            <button type="button" className="btn btn-outline flex-1 sm:flex-none" onClick={() => (setChooser(null), setPicked([]))}>
              {cp.cancel}
            </button>
            <button type="button" className="btn btn-primary flex-1" disabled={!picked.length} onClick={() => void addAfter()}>
              {picked.length ? cp.addCount(picked.length) : cp.add}
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-primary w-full" onClick={onClose}>
            {cp.done}
          </button>
        )
      }
    >
      <input ref={input} type="file" accept={PHOTO_ACCEPT} multiple className="hidden" onChange={(e) => void upload([...(e.target.files ?? [])])} />
      {ed.error ? <p className="mb-3 text-sm text-wine">{cp.error}</p> : null}
      {ed.note ? <p className="mb-3 text-sm text-amber-800">{ed.note}</p> : null}

      {chooser && (chooser === "after" || openerPhoto) ? (
        chooserView
      ) : (
        <>
          {frame ? (
            <section aria-label={cp.section}>
              <h3 className="font-medium">{cp.section}</h3>
              <div className="mt-3 flex items-start gap-4">
                <div className="w-[34%] max-w-40 shrink-0 overflow-hidden rounded-md shadow-sm ring-1 ring-line">
                  <OpenerPage
                    kit={pageKit(design, format, cqwUnits(format.widthMm), book.language)}
                    number={chapter?.number ?? null}
                    title={title}
                    epigraph={chapter?.epigraph}
                    photo={openerPhoto ? { url: photoUrl(openerPhoto.id, "view"), crop: shown } : undefined}
                    style={{ aspectRatio: `${format.widthMm} / ${format.heightMm}` }}
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  {openerPhoto ? (
                    <PanFrame
                      photo={openerPhoto}
                      crop={shown}
                      ratio={frame.ratio}
                      mask={frame.mask}
                      card={frame.card}
                      width={frameW}
                      disabled={!book.editable}
                      onChange={(value) => setCrop({ id: openerPhoto.id, value })}
                      onCommit={(c) => void ed.edit(openerPhoto.id, { crop: c })}
                    />
                  ) : (
                    <button
                      type="button"
                      disabled={!book.editable}
                      onClick={() => openUpload("opener")}
                      className={cn("flex items-center justify-center border-2 border-dashed border-line bg-cream/40 text-muted", frame.mask === "circle" ? "rounded-full" : frame.mask === "arch" ? "rounded-t-full" : "rounded-lg")}
                      style={{ width: frameW, aspectRatio: String(frame.ratio) }}
                      aria-label={cp.upload}
                    >
                      <ImagePlus className="size-6" />
                    </button>
                  )}
                </div>
              </div>
              {printedPage !== undefined ? (
                <div className="mt-3 flex items-center gap-3 rounded-xl bg-cream/50 p-2.5 text-sm">
                  {printedPage ? (
                    // eslint-disable-next-line @next/next/no-img-element -- страница из сборки книги
                    <img src={printedPage} alt="" className="w-14 shrink-0 rounded-sm shadow-sm ring-1 ring-line" />
                  ) : (
                    <LoaderCircle className="size-4 shrink-0 animate-spin text-muted" aria-hidden />
                  )}
                  <span className="min-w-0">
                    <span className="block font-medium">{cp.check}</span>
                    {printedPage ? null : <span className="block text-muted">{cp.checkWait}</span>}
                  </span>
                </div>
              ) : null}
              {openerPhoto ? (
                <div className="mt-3 space-y-3">
                  <p className="text-sm text-muted">{cp.hint}</p>
                  <ZoomSlider value={shown.zoom} disabled={!book.editable} onChange={(zoom) => setCrop({ id: openerPhoto.id, value: { ...shown, zoom } })} onCommit={() => void ed.edit(openerPhoto.id, { crop: { ...shown } })} />
                  {lowResIn(openerPhoto, frame, shown.zoom) ? <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{cp.lowRes}</p> : null}
                  {opener?.auto ? (
                    <button type="button" className="text-left text-sm text-wine underline underline-offset-2" onClick={() => setChooser("opener")}>
                      {cp.legacy}
                    </button>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn btn-outline min-w-0 flex-1" disabled={!book.editable} onClick={() => setChooser("opener")}>
                      {cp.other}
                    </button>
                    <button type="button" className="btn btn-outline min-w-0 flex-1" disabled={!book.editable} onClick={() => void none()}>
                      {cp.none}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3">
                  <p className="text-sm text-muted">{noneChosen ? cp.noneState : cp.empty}</p>
                  {!noneChosen && book.editable ? (
                    <button type="button" className="btn btn-outline btn-sm mt-2 min-h-11" onClick={() => void none()}>
                      {cp.none}
                    </button>
                  ) : null}
                  <div className="mt-4">
                    <div className="mb-2 text-sm font-medium">{cp.grid}</div>
                    <PhotoChooser
                      mode="opener"
                      photos={ed.photos}
                      places={ed.places}
                      chapterKey={chapterKey}
                      fit={fit}
                      picked={[]}
                      names={names}
                      blank={book.blank}
                      openerDesign
                      editable={book.editable}
                      uploading={ed.uploading}
                      onPick={(id) => void pickOpener(id)}
                      onUpload={() => openUpload("opener")}
                    />
                  </div>
                </div>
              )}
            </section>
          ) : (
            <section className="rounded-2xl bg-cream/60 p-4 text-sm">
              <p className="leading-relaxed text-ink-soft">{cp.noOpenerDesign(designName, photoDesigns)}</p>
              {onChangeDesign ? (
                <button type="button" className="btn btn-outline btn-sm mt-3 min-h-11" onClick={onChangeDesign}>
                  {cp.changeDesign}
                </button>
              ) : null}
            </section>
          )}

          <section ref={afterRef} className="mt-7" aria-label={cp.after}>
            <h3 className="font-medium">{cp.after}</h3>
            <p className="mt-0.5 text-sm text-muted">{cp.afterHint}</p>
            {after.length ? (
              <ul className="-mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:-mx-5 sm:px-5">
                {after.map((p) => {
                  const auto = !!ed.places.get(p.id)?.auto;
                  const i = pinned.findIndex((x) => x.id === p.id);
                  return (
                    <li key={p.id} className="w-28 shrink-0 snap-start">
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setPlaceFor(p.id)}
                          aria-label={m.editor.photoPlace.aria(label(ed.places.get(p.id)))}
                          className={cn("relative block aspect-square w-full overflow-hidden rounded-xl bg-cream", auto ? "ring-2 ring-dashed ring-wine/40" : "ring-1 ring-line")}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- фото клиента */}
                          <img src={photoUrl(p.id)} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
                        </button>
                        {auto ? (
                          <span className="absolute top-1.5 left-1.5 rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-ink-soft">{cp.autoChip}</span>
                        ) : book.editable ? (
                          <button type="button" onClick={() => void ed.move([{ id: p.id, target: { kind: "auto" } }], { toast: (b, a) => m.editor.placeSheet.toast(label(b.get(p.id)), label(a.get(p.id))), undoLabel: cp.undo })} className="absolute -top-1.5 -right-1.5 flex size-9 items-center justify-center rounded-full bg-white text-muted shadow ring-1 ring-line hover:text-ink" aria-label={cp.unpinAria}>
                            <X className="size-4" />
                          </button>
                        ) : null}
                      </div>
                      {auto ? (
                        book.editable ? (
                          <button type="button" className="mt-1 flex min-h-11 w-full items-center justify-center gap-1 rounded-lg text-xs font-medium text-wine hover:bg-wine/5" onClick={() => void ed.move([toAfter(p.id)], { toast: (b) => m.editor.placeSheet.toast(label(b.get(p.id)), m.editor.photoPlace.after(title)), undoLabel: cp.undo })}>
                            <Pin className="size-3.5" /> {cp.pin}
                          </button>
                        ) : null
                      ) : book.editable && pinned.length > 1 ? (
                        <div className="mt-1 flex justify-between">
                          <button type="button" className="flex size-11 items-center justify-center rounded-lg text-muted hover:bg-cream disabled:opacity-30" disabled={i <= 0} onClick={() => moveInList(p.id, -1)} aria-label={cp.earlier}>
                            <ArrowLeft className="size-4" />
                          </button>
                          <button type="button" className="flex size-11 items-center justify-center rounded-lg text-muted hover:bg-cream disabled:opacity-30" disabled={i >= pinned.length - 1} onClick={() => moveInList(p.id, 1)} aria-label={cp.later}>
                            <ArrowRight className="size-4" />
                          </button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {autoAfter.length ? <p className="mt-1 text-xs text-muted">{cp.autoHint}</p> : null}
            {book.editable ? (
              <button type="button" className="btn btn-outline mt-3 w-full sm:w-auto" onClick={() => setChooser("after")}>
                <ImagePlus className="size-4" /> {cp.add}
              </button>
            ) : null}
          </section>
        </>
      )}

      {placeFor ? <PlaceSheet data={ed.view} on={ed.relay} photoId={placeFor} onClose={() => setPlaceFor(null)} /> : null}
    </Sheet>
  );
}
