"use client";

import { useState } from "react";
import { Check, ChevronRight, Crop } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { getFormat } from "@/lib/book/formats";
import { gridCellFrame, pageFrame } from "@/lib/book/photo-pages";
import type { PhotoPlace } from "@/lib/book/photo-place";
import { cn } from "@/lib/class-names";
import { photoUrl } from "@/lib/urls";
import { CropDialog } from "../CropDialog";
import { chosenOpener, currentOption, noOpenerPhotoOf, openerOf, photoChapters, withNoOpenerPhoto, type PlaceData, type PlaceEvents, type PlaceTarget } from "./model";
import { PhotoIntroCard } from "./PhotoIntro";
import { placeText } from "./PlaceBadge";
import { Sheet } from "./Sheet";
import { usePlaceEditing } from "./usePlaceEditing";

type Step = "place" | "answer" | "opener" | "after";
const LAYOUTS = ["full", "bleed", "half", "grid"] as const;

/**
 * Лист «Где стоит фото»: шаг 1 — место (в ответ, фото главы, после главы, альбом в конце, пусть встанет само,
 * не печатать), шаг 2 — глава или ответ. Каждый перенос — одной правкой и с «Отменить» в тосте; вопрос — только
 * если фото уходит из ответа или из фото другой главы. Ниже — вид фото на странице (для страниц фото после глав
 * и альбома): раскладка, кадр (под обрез и в сетке) и подпись (там, где она печатается).
 */
export function PlaceSheet({ data, on, photoId, onClose, layer = "z-[91]" }: { data: PlaceData; on: PlaceEvents; photoId: string; onClose: () => void; layer?: string }) {
  const m = useMessages();
  const t = m.editor.placeSheet;
  const ed = usePlaceEditing(data, on);
  const { book, design, names } = ed;
  const [step, setStep] = useState<Step>("place");
  const [cropping, setCropping] = useState(false);
  const photo = ed.photos.find((p) => p.id === photoId);
  const place = ed.places.get(photoId);
  const [caption, setCaption] = useState(photo?.caption ?? "");
  if (!photo || !place) return null;

  const openerDesign = !!design.opener.photo;
  const current = currentOption(place, photo);
  const label = (p: PhotoPlace) => placeText(p, names, m.editor, book.blank, { marked: photo.opener, openerDesign });
  const chapters = photoChapters(data.chapters);
  const answers = data.answers ?? [];

  const go = async (target: PlaceTarget) => {
    const ok = await ed.move([{ id: photoId, target }], {
      undoLabel: t.undo,
      toast: (before, after) => t.toast(before.get(photoId) ? label(before.get(photoId)!) : "—", target.kind === "auto" ? t.auto.label : label(after.get(photoId)!)),
    });
    if (!ok) return;
    setStep("place");
    // Фото главы выбрано — отметка «без фото» у этой главы больше не нужна (R3).
    if (target.kind === "opener" && noOpenerPhotoOf(ed.tocLines, target.chapterKey)) void ed.saveBook({ tocLines: (lines) => withNoOpenerPhoto(lines, target.chapterKey, false) });
  };

  const options: { kind: PlaceTarget["kind"]; label: string; hint: string; next?: Step }[] = [
    ...(answers.length || current === "answer" ? [{ kind: "answer" as const, ...(book.blank ? t.answerBlank : t.answer), next: "answer" as const }] : []),
    ...(design.opener.photo ? [{ kind: "opener" as const, label: t.opener.label, hint: t.opener.hint(m.editor.openerShape[design.opener.photo]), next: "opener" as const }] : []),
    { kind: "after", ...t.after, next: "after" },
    { kind: "album", label: t.album.label, hint: t.album.hint(book.galleryTitle) },
    { kind: "auto", label: t.auto.label, hint: t.auto.hint[ed.photoPlacement] },
    { kind: "off", ...t.off },
  ];
  const onPage = place.kind === "after" || place.kind === "album";
  const layout = photo.layout ?? "full";
  const format = getFormat(book.format);
  const title = step === "place" ? t.title : step === "answer" ? (book.blank ? t.step2AnswerBlank : t.step2Answer) : t.step2Chapter;

  return (
    <Sheet
      title={title}
      onClose={onClose}
      onBack={step === "place" ? undefined : () => setStep("place")}
      backLabel={t.back}
      closeLabel={t.close}
      layer={layer}
      footer={
        <button type="button" className="btn btn-primary w-full" onClick={onClose}>
          {m.editor.chapterPhoto.done}
        </button>
      }
    >
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- фото клиента */}
        <img src={photoUrl(photo.id)} alt="" className="size-16 shrink-0 rounded-xl bg-cream object-cover ring-1 ring-line" />
        <div className="min-w-0 text-sm">
          <div className="font-medium">{label(place)}</div>
          {place.onCover ? <div className="mt-0.5 text-muted">{place.onCover === "cover" ? t.coverNote : t.backNote}</div> : null}
        </div>
      </div>
      {ed.error ? <p className="mt-3 text-sm text-wine">{m.editor.chapterPhoto.error}</p> : null}

      {step === "place" ? (
        <>
          <PhotoIntroCard blank={book.blank} className="mt-4 rounded-2xl bg-cream/70 p-4" />
          <div role="radiogroup" aria-label={t.title} className="mt-4 space-y-2">
            {options.map((o) => {
              const here = o.kind === current;
              return (
                <button
                  key={o.kind}
                  type="button"
                  role="radio"
                  aria-checked={here}
                  disabled={!book.editable}
                  onClick={() => (o.next ? setStep(o.next) : here ? undefined : void go({ kind: o.kind } as PlaceTarget))}
                  className={cn("flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left ring-1 transition disabled:opacity-60", here ? "bg-wine/5 ring-2 ring-wine" : "ring-line hover:bg-cream/50")}
                >
                  <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border", here ? "border-wine bg-wine text-white" : "border-line")}>{here ? <Check className="size-3" /> : null}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 font-medium">
                      {o.label}
                      {here ? <span className="text-xs font-normal text-wine">{t.here}</span> : null}
                    </span>
                    <span className="mt-0.5 block text-sm leading-snug text-muted">{o.hint}</span>
                  </span>
                  {o.next ? <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden /> : null}
                </button>
              );
            })}
          </div>

          {onPage ? (
            <section className="mt-6">
              <div className="text-sm font-medium">{t.layoutTitle}</div>
              <div role="radiogroup" aria-label={t.layoutTitle} className="mt-2 grid grid-cols-2 gap-2">
                {LAYOUTS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="radio"
                    aria-checked={layout === l}
                    disabled={!book.editable}
                    onClick={() => layout !== l && void ed.edit(photoId, { layout: l })}
                    className={cn("min-h-11 rounded-xl px-3 py-2 text-left text-sm leading-snug ring-1 transition", layout === l ? "bg-wine/5 font-medium ring-2 ring-wine" : "ring-line hover:bg-cream/50")}
                  >
                    {t.layouts[l]}
                  </button>
                ))}
              </div>
              {/* Кадр — где снимок обрезается рамкой (под обрез, клетка сетки); подпись — где она печатается (R10). */}
              {layout === "bleed" || layout === "grid" ? (
                <button type="button" className="btn btn-outline btn-sm mt-3 min-h-11" disabled={!book.editable} onClick={() => setCropping(true)}>
                  <Crop className="size-4" /> {t.crop}
                </button>
              ) : null}
              {layout !== "bleed" ? (
                <label className="mt-3 block">
                  <span className="label">{t.caption}</span>
                  <input
                    className="input"
                    value={caption}
                    maxLength={200}
                    disabled={!book.editable}
                    onChange={(e) => setCaption(e.target.value)}
                    onBlur={() => caption !== (photo.caption ?? "") && void ed.edit(photoId, { caption })}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  />
                </label>
              ) : null}
            </section>
          ) : null}
        </>
      ) : step === "answer" ? (
        <AnswerList data={data} current={place.kind === "answer" ? place.questionId : undefined} onPick={(questionId) => void go({ kind: "answer", questionId })} />
      ) : (
        <ul className="mt-4 space-y-2">
          {chapters.length ? null : <li className="text-sm text-muted">{book.blank ? m.books.photosTab.noChaptersBlank : m.books.photosTab.noChapters}</li>}
          {chapters.map((c) => {
            const here = !place.auto && place.kind === step && place.chapterKey === c.key;
            const waiting = place.waitingFor === c.key && (step === "opener") === !!photo.opener;
            const opener = openerOf(ed.places, c.key);
            const replaces = step === "opener" && !!chosenOpener(ed.places, c.key, photoId);
            return (
              <li key={c.key}>
                <button
                  type="button"
                  disabled={!book.editable}
                  aria-current={here || waiting ? "true" : undefined}
                  onClick={() => (here ? setStep("place") : void go({ kind: step as "opener" | "after", chapterKey: c.key }))}
                  className={cn("flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left ring-1 transition", here || waiting ? "bg-wine/5 ring-2 ring-wine" : "ring-line hover:bg-cream/50")}
                >
                  {opener ? (
                    // eslint-disable-next-line @next/next/no-img-element -- фото главы сейчас
                    <img src={photoUrl(opener.id)} alt="" className="size-10 shrink-0 rounded-lg bg-cream object-cover" />
                  ) : (
                    <span className="size-10 shrink-0 rounded-lg border border-dashed border-line bg-cream/40" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.title}</span>
                    {here || waiting ? <span className="block text-xs text-wine">{t.here}</span> : null}
                    {!c.printed ? <span className="block text-xs text-muted">{t.noText}</span> : replaces && !here ? <span className="block text-xs text-amber-700">{t.replaces}</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {cropping ? (
        <CropDialog
          photo={photo}
          crop={photo.crop ?? null}
          frame={layout === "grid" ? gridCellFrame(format, design) : pageFrame(format)}
          onClose={() => setCropping(false)}
          onSave={(crop) => {
            setCropping(false);
            void ed.edit(photoId, { crop });
          }}
        />
      ) : null}
    </Sheet>
  );
}

/** Шаг 2 «Какой ответ?»: ответы по главам; текущий отмечен. */
function AnswerList({ data, current, onPick }: { data: PlaceData; current?: string; onPick: (questionId: string) => void }) {
  const t = useMessages().editor.placeSheet;
  const answers = data.answers ?? [];
  const groups = data.chapters.map((c) => ({ c, list: answers.filter((a) => a.chapterKey === c.key) })).filter((g) => g.list.length);
  return (
    <div className="mt-4 space-y-4">
      {groups.map(({ c, list }) => (
        <section key={c.key}>
          <div className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">{c.title}</div>
          <ul className="space-y-1.5">
            {list.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  disabled={!data.book.editable}
                  aria-current={a.id === current ? "true" : undefined}
                  onClick={() => a.id !== current && onPick(a.id)}
                  className={cn("flex min-h-12 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ring-1 transition", a.id === current ? "bg-wine/5 ring-2 ring-wine" : "ring-line hover:bg-cream/50")}
                >
                  <span className="min-w-0 flex-1 truncate">{a.title}</span>
                  {a.id === current ? <span className="shrink-0 text-xs text-wine">{t.here}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
