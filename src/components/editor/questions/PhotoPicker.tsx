"use client";

import { useRef, useState } from "react";
import { Check, ImagePlus, LoaderCircle } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import { useMessages } from "@/i18n/client";
import type { ClientMessages } from "@/i18n/messages";
import { toEditorPhoto, type EditorPhoto, type PhotoUndo } from "@/lib/book/editor-model";
import type { PhotoPlace } from "@/lib/book/photo-place";
import { photoUrl } from "@/lib/urls";
import { cn } from "@/lib/class-names";
import { MAX_PHOTOS } from "@/modules/authoring/domain/Photo";
import { patchPhotos, uploadPhotos } from "../photos/api";
import type { PlaceNames } from "../photos/model";
import { PlaceBadge } from "../photos/PlaceBadge";
import { Sheet } from "../photos/Sheet";
import type { UploadResult } from "./useInlinePhotos";

/**
 * Нужен ли вопрос, прежде чем поставить фото в ответ questionId: ответ снимает с фото главу и отметку фото главы
 * (Photo.update), поэтому спрашиваем, когда фото уходит из другого ответа, из фото главы (выбранного автором — место,
 * подставленное прежними правилами, глава получит обратно сама) или с места после главы. marked — у фото отметка
 * «фото главы» (оно ждёт главу без текста). Остальное переносится сразу, с «Отменить».
 */
export type PickerConfirm = { kind: "answer"; questionId: string } | { kind: "opener"; chapterKey: string } | { kind: "after"; chapterKey: string } | null;

export function pickerConfirm(place: PhotoPlace | undefined, questionId: string, marked = false): PickerConfirm {
  if (!place) return null;
  if (place.questionId) return place.questionId === questionId ? null : { kind: "answer", questionId: place.questionId };
  if (place.waitingFor) return { kind: marked ? "opener" : "after", chapterKey: place.waitingFor };
  if (place.auto || !place.chapterKey) return null;
  if (place.kind === "opener" || place.kind === "after") return { kind: place.kind, chapterKey: place.chapterKey };
  return null;
}

/** Что сказать после загрузки: ошибки по файлам и — если упёрлись в предел книги — сколько загрузили, а сколько не поместилось. */
export function uploadNote(t: ClientMessages["editor"]["photoPicker"], max: number, res: Pick<UploadResult, "photos" | "errors" | "cut">): string | null {
  const notes = res.errors.filter(Boolean);
  if (res.cut > 0) notes.push(t.cap(max, res.photos.length));
  return notes.length ? notes.join(" ") : null;
}

/** Место фото, когда вызывающий не передал места собранной книги: известен только ответ. */
const answerPlace = (p: EditorPhoto): PhotoPlace | undefined => (p.questionId ? { kind: "answer", questionId: p.questionId, auto: false, onCover: p.onCover } : undefined);

const isPhone = () => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;

/**
 * Фото в ответ: все фото книги (и снимки обложки) с подписью, где каждое стоит сейчас. Нажали — фото встаёт в этот
 * ответ: из другого места оно переезжает (у фото уходит одно место), вопрос — только когда оно уходит из другого
 * ответа, из фото главы или с места после главы. Загрузка — до предела фото книги, о не поместившихся говорим.
 * На телефоне лист закрывается после первого выбранного фото, «Отменить» — в тосте.
 */
export function PhotoPicker({
  bookId,
  photos,
  questionId,
  questionLabel,
  onAttach,
  onDetach,
  onUploaded,
  onClose,
  otherLabel,
  places,
  names,
  blank = false,
  openerDesign,
  maxPhotos = MAX_PHOTOS,
  upload,
  onUndo,
  onPlace,
}: {
  bookId: string;
  photos: EditorPhoto[];
  questionId: string;
  questionLabel: string;
  /** Поставить фото в ответ; вернёт снимок для «Отменить» (useInlinePhotos.patchPhoto) — тогда будет тост с отменой. */
  onAttach: (id: string) => void | Promise<PhotoUndo | null | void>;
  onDetach: (id: string) => void;
  onUploaded: (list: EditorPhoto[]) => void;
  onClose: () => void;
  otherLabel: (questionId: string) => string;
  /** Места фото в собранной книге (useBookContent().places); без них подпись — только у фото в ответах. */
  places?: ReadonlyMap<string, PhotoPlace>;
  /** Названия глав и ответов для подписей мест; без них ответы — через otherLabel, главы — «—». */
  names?: PlaceNames;
  /** Своя книга: «раздел» вместо «ответ». */
  blank?: boolean;
  /** В оформлении есть фото главы. */
  openerDesign?: boolean;
  /** Предел фото в книге (MAX_PHOTOS). */
  maxPhotos?: number;
  /** Загрузка редактора (useInlinePhotos.upload): с пределом книги и прогрессом. Без неё — своя, с тем же пределом. */
  upload?: (files: readonly File[], opts: { place?: (index: number) => { questionId: string } | null; onProgress?: (done: number, total: number) => void }) => Promise<UploadResult>;
  /** «Отменить» в тосте после переноса (useInlinePhotos.applyUndo). */
  onUndo?: (undo: PhotoUndo) => unknown;
  /** Нажали на подпись места — открыть лист «Где стоит фото». */
  onPlace?: (id: string) => void;
}) {
  const m = useMessages();
  const t = m.editor.photoPicker;
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [asking, setAsking] = useState<{ id: string; confirm: NonNullable<PickerConfirm> } | null>(null);
  const placeNames: PlaceNames = names ?? { chapter: () => "—", question: (id) => otherLabel(id) };
  const placeOf = (p: EditorPhoto) => places?.get(p.id) ?? answerPlace(p);
  const here = photos.filter((p) => p.questionId === questionId).length;

  const attach = async (id: string) => {
    setAsking(null);
    const undo = await onAttach(id);
    if (undo && onUndo) toast(blank ? t.toastBlank : t.toast, "success", { action: { label: t.undo, run: () => onUndo(undo) } });
    if (isPhone()) onClose();
  };

  const pick = (p: EditorPhoto) => {
    if (p.questionId === questionId) return onDetach(p.id);
    const confirm = pickerConfirm(placeOf(p), questionId, p.opener);
    if (confirm) setAsking({ id: p.id, confirm });
    else void attach(p.id);
  };

  /** Своя загрузка (без useInlinePhotos.upload): до предела книги, потом — в этот ответ. */
  const uploadHere = async (files: readonly File[], onProgress: (done: number, total: number) => void): Promise<UploadResult> => {
    const list = files.slice(0, Math.max(0, maxPhotos - photos.length));
    const cut = files.length - list.length;
    if (!list.length) return { photos: [], errors: [], cut };
    onProgress(0, list.length);
    const res = await uploadPhotos(bookId, list, (done) => onProgress(done, list.length));
    const placed = new Map((await patchPhotos(bookId, res.photos.map((r) => ({ id: r.id, patch: { questionId } })))).map((r) => [r.id, r]));
    return { photos: res.photos.map((r) => toEditorPhoto(placed.get(r.id) ?? { ...r, questionId })), errors: res.errors, cut };
  };

  const send = async (files: File[]) => {
    if (!files.length) return;
    setNote(null);
    try {
      const onProgress = (done: number, total: number) => setProgress({ done, total });
      const res = upload ? await upload(files, { place: () => ({ questionId }), onProgress }) : await uploadHere(files, onProgress);
      if (res.photos.length) onUploaded(res.photos);
      setNote(uploadNote(t, maxPhotos, res));
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  };

  const askedPhoto = asking ? photos.find((p) => p.id === asking.id) : undefined;
  const askText = (c: NonNullable<PickerConfirm>) => {
    if (c.kind === "answer") return (blank ? m.editor.chapterPhoto.confirmAnswerBlank : m.editor.chapterPhoto.confirmAnswer)(placeNames.question(c.questionId));
    if (c.kind === "opener") return t.confirmOpener(placeNames.chapter(c.chapterKey));
    return (blank ? t.confirmAfterBlank : t.confirmAfter)(placeNames.chapter(c.chapterKey));
  };

  return (
    <Sheet
      title={blank ? t.titleBlank : t.title}
      onClose={onClose}
      closeLabel={m.editor.close}
      full
      footer={
        asking && askedPhoto ? (
          <div className="flex items-start gap-3" role="alertdialog" aria-label={blank ? t.confirmTitleBlank : t.confirmTitle} data-testid="picker-confirm">
            {/* eslint-disable-next-line @next/next/no-img-element -- фото клиента */}
            <img src={photoUrl(askedPhoto.id)} alt="" className="size-14 shrink-0 rounded-xl bg-cream object-cover ring-1 ring-line" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{asking.confirm.kind === "answer" ? (blank ? m.editor.chapterPhoto.confirmAnswerTitleBlank : m.editor.chapterPhoto.confirmAnswerTitle) : blank ? t.confirmTitleBlank : t.confirmTitle}</div>
              <p className="mt-0.5 text-sm leading-snug text-muted">{askText(asking.confirm)}</p>
              <div className="mt-3 flex gap-2">
                <button type="button" className="btn btn-primary h-11 flex-1" onClick={() => void attach(asking.id)}>
                  {t.move}
                </button>
                <button type="button" className="btn btn-ghost h-11 flex-1" onClick={() => setAsking(null)}>
                  {t.cancel}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button type="button" className="btn btn-primary w-full" onClick={onClose}>
            {t.done(here)}
          </button>
        )
      }
    >
      <p className="text-sm leading-snug text-muted">{(blank ? t.introBlank : t.intro)(questionLabel)}</p>
      <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void send([...(e.target.files ?? [])])} />
      <button
        type="button"
        className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-cream/30 px-4 text-sm font-medium text-ink hover:bg-cream/60 disabled:opacity-60"
        onClick={() => input.current?.click()}
        disabled={!!progress}
      >
        {progress ? <LoaderCircle className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
        {progress ? t.progress(progress.done, progress.total) : t.upload}
      </button>
      {note ? (
        <p className="mt-2 text-sm text-wine" role="status" data-testid="picker-note">
          {note}
        </p>
      ) : null}
      {photos.length ? (
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((p) => {
            const on = p.questionId === questionId;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => pick(p)}
                  aria-pressed={on}
                  className={cn("relative block aspect-square w-full overflow-hidden rounded-xl bg-cream ring-offset-2 ring-offset-white transition", on ? "ring-2 ring-wine" : asking?.id === p.id ? "ring-2 ring-ink" : "ring-1 ring-line hover:ring-ink/30")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- фото клиента */}
                  <img src={photoUrl(p.id)} alt={p.caption} className="absolute inset-0 size-full object-cover" loading="lazy" />
                  {on ? (
                    <span className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-wine text-white">
                      <Check className="size-3.5" />
                    </span>
                  ) : null}
                </button>
                <PlaceBadge place={placeOf(p)} names={placeNames} blank={blank} marked={p.opener} openerDesign={openerDesign} onOpen={onPlace ? () => onPlace(p.id) : undefined} className="mt-1" />
              </li>
            );
          })}
        </ul>
      ) : null}
    </Sheet>
  );
}
