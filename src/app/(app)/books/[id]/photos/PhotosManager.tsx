"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ImagePlus, Images, LoaderCircle, Maximize2 } from "lucide-react";
import { confirmDialog, toast } from "@/components/ui/overlays";
import { apiFetch } from "@/lib/client-api";
import { useMessages } from "@/i18n/client";
import { Alert } from "@/components/ui/Alert";
import { getFormat } from "@/lib/book/formats";
import { effectiveDpi, photoAreaMm } from "@/lib/book/layout";
import type { PlaceFrame } from "@/lib/book/photo-pages";
import { cn } from "@/lib/class-names";
import { PhotosArt } from "@/components/illustrations";
import { CropDialog } from "@/components/editor/CropDialog";
import { patchPhotos } from "@/components/editor/photos/api";
import { albumPhotos, galleryTitleOf, type PlaceData, type SheetPhoto } from "@/components/editor/photos/model";
import { GallerySheet } from "@/components/editor/photos/GallerySheet";
import { PhotoIntroCard } from "@/components/editor/photos/PhotoIntro";
import { placeText } from "@/components/editor/photos/PlaceBadge";
import { PlaceSheet } from "@/components/editor/photos/PlaceSheet";
import { usePlaceEditing } from "@/components/editor/photos/usePlaceEditing";
import { PhotoCard } from "./PhotoCard";
import { PlacementRule } from "./PlacementRule";
import { BANNER_MIN, cropFrameOf, deleteDialogOf, filterCounts, lossOf, matchesFilter, visibleFilters, wideBleedIds, type PhotoFilter, type PhotoLayout, type PhotosTabData } from "./photos-tab";

/**
 * Вкладка «Фото»: у каждого фото написано, где оно в книге, — «Где в книге» открывает лист места. Сверху — объяснение,
 * правило для фото без выбранного места и фильтры; совет «Показать целиком» для фото «До краёв» с заметной обрезкой
 * (одним пакетом, одна отмена); удаление спрашивает с учётом обложки и главы и всегда предлагает вариант без удаления.
 * Места и обрезку считает сервер той же сборкой, что у PDF; после правки лист сразу показывает новое место
 * (usePlaceEditing), а страница пересобирается на сервере (router.refresh) — и места снова точные.
 */
export function PhotosManager({ data, initialFilter }: { data: PhotosTabData; initialFilter: PhotoFilter }) {
  const m = useMessages();
  const t = m.books.photos;
  const tt = m.books.photosTab;
  const router = useRouter();
  const placeData = useMemo<PlaceData>(() => ({ book: data.book, photos: data.photos, places: new Map(data.places), chapters: data.chapters, answers: data.answers, tocLines: data.tocLines }), [data]);
  const refresh = () => router.refresh();
  const ed = usePlaceEditing(placeData, { onPhotos: refresh, onUploaded: refresh, onBook: refresh, onOrder: refresh });
  const { book, design, names } = ed;
  const editable = book.editable;
  const fmt = getFormat(book.format);
  const openerDesign = !!design.opener.photo;

  const [filter, setFilter] = useState<PhotoFilter>(initialFilter);
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [placeFor, setPlaceFor] = useState<string | null>(null);
  const [gallery, setGallery] = useState(false);
  const [cropping, setCropping] = useState<{ photo: SheetPhoto; frame: PlaceFrame } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const photos = useMemo(() => ed.photos.filter((p) => !removed.has(p.id)), [ed.photos, removed]);
  const server = useMemo(() => new Map(data.photos.map((p) => [p.id, p])), [data.photos]);
  const loss = (p: Pick<SheetPhoto, "id" | "layout">) => lossOf(p, server.get(p.id), data.losses);
  const lossById = (id: string) => {
    const p = photos.find((x) => x.id === id);
    return p ? loss(p) : 0;
  };
  const counts = filterCounts(photos, ed.places, lossById);
  const shown = photos.filter((p) => matchesFilter(filter, ed.places.get(p.id), loss(p)));
  const wide = wideBleedIds(photos, ed.places, lossById);
  const printed = data.chapters.some((c) => c.printed);
  const sortable = editable && filter === "all";
  const galleryTitle = galleryTitleOf(ed.tocLines, book.galleryTitle);
  const album = albumPhotos(photos, ed.places).length;

  const upload = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|avif|tiff?)$/i.test(f.name));
    if (!images.length) return;
    setErrors([]);
    // Новые фото встают по правилу книги — место им выбирают потом, «Где в книге».
    await ed.upload(images, () => []);
    if (input.current) input.current.value = "";
  };

  /** «Показать целиком»: фото «До краёв» становятся «Целиком, с полями» — одним запросом и с одной отменой. */
  const showWhole = async (ids: string[]) => {
    if (!ids.length || !editable) return;
    const before = ids.map((id) => ({ id, layout: photos.find((p) => p.id === id)?.layout ?? "bleed" }));
    try {
      ed.relay.onPhotos(await patchPhotos(book.id, ids.map((id) => ({ id, patch: { layout: "full" as const } }))));
      ed.setError(false);
    } catch {
      ed.setError(true);
      return;
    }
    toast(tt.toastWhole(ids.length), "success", { action: { label: tt.undo, run: async () => ed.relay.onPhotos(await patchPhotos(book.id, before.map(({ id, layout }) => ({ id, patch: { layout } })))) } });
  };

  /** Удаление: где фото сейчас, что станет с обложкой и главой, и вариант без удаления — «не печатать в книге». */
  const remove = async (p: SheetPhoto) => {
    const place = ed.places.get(p.id);
    const label = place ? placeText(place, names, m.editor, book.blank, { marked: p.opener, openerDesign }) : "";
    const d = deleteDialogOf(place, tt.delete, { place: label, chapter: names.chapter });
    const answer = d.altLabel ? await confirmDialog({ ...d, altLabel: d.altLabel, danger: true }) : await confirmDialog({ ...d, danger: true });
    if (answer === "alt") {
      // Вопрос уже был — второй (фото уходит из ответа или из фото главы) не нужен.
      await ed.move([{ id: p.id, target: { kind: "off" } }], { toast: tt.toastKept, undoLabel: tt.undo, confirm: false });
      return;
    }
    if (answer !== true) return;
    setRemoved((s) => new Set(s).add(p.id));
    try {
      await apiFetch(`/api/books/${book.id}/photos/${p.id}`, { method: "DELETE" });
      refresh();
    } catch (e) {
      setRemoved((s) => {
        const next = new Set(s);
        next.delete(p.id);
        return next;
      });
      setErrors([(e as Error).message]);
    }
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = photos.map((p) => p.id);
    void ed.reorder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };

  const notes = [...errors, ...(ed.note ? [ed.note] : []), ...(ed.error ? [m.editor.chapterPhoto.error] : [])];

  return (
    <div
      onDragOver={(e) => {
        if (!editable || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!editable || !e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragOver(false);
        void upload([...e.dataTransfer.files]);
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
        <div className="min-w-0 sm:max-w-2xl">
          <h1 className="font-serif text-3xl font-medium sm:text-5xl">{t.title}</h1>
          <p className="mt-2 text-sm text-muted sm:text-base">{photos.length ? tt.intro : t.intro}</p>
        </div>
        {editable ? (
          <>
            <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void upload([...(e.target.files ?? [])])} />
            <button className="btn btn-primary btn-lg max-sm:w-full" onClick={() => input.current?.click()} disabled={!!ed.uploading}>
              {ed.uploading ? <LoaderCircle className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
              {ed.uploading ? t.uploading(ed.uploading.done, ed.uploading.total) : t.add}
            </button>
          </>
        ) : null}
      </div>

      {notes.length ? (
        <Alert className="mt-6">
          {notes.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </Alert>
      ) : null}

      {photos.length === 0 ? (
        <button
          disabled={!editable}
          onClick={() => input.current?.click()}
          className={cn(
            "mt-10 flex w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-14 text-center transition",
            dragOver ? "border-wine bg-wine/5" : "border-line hover:border-ink/30",
          )}
        >
          <PhotosArt className="h-36 w-auto" />
          <div className="mt-3 font-serif text-2xl font-medium">{t.empty}</div>
          <div className="mt-1 text-sm text-muted">{t.emptyText}</div>
          <span className="btn btn-primary btn-sm mt-5">
            <ImagePlus className="size-4" /> {t.choose}
          </span>
        </button>
      ) : (
        <>
          <PhotoIntroCard blank={book.blank} className="mt-6 rounded-2xl bg-cream/70 p-4" />
          <div className="mt-4">
            <PlacementRule value={ed.photoPlacement} gallery={galleryTitle} blank={book.blank} noChapters={!printed} editable={editable} onChange={(photoPlacement) => void ed.saveBook({ photoPlacement })} />
          </div>
          {/* Альбом в конце — название, порядок и состав правят в его листе. */}
          {album ? (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-white p-3 ring-1 ring-line">
              <Images className="size-4 shrink-0 text-wine" aria-hidden />
              <span className="min-w-0 flex-1 text-sm font-medium">{m.books.pagesPhotos.albumRow(galleryTitle, album)}</span>
              <button type="button" className="btn btn-outline btn-sm min-h-11" onClick={() => setGallery(true)}>
                {m.books.pagesPhotos.albumEdit}
              </button>
            </div>
          ) : null}

          {wide.length >= BANNER_MIN && editable ? (
            <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200 sm:flex-row sm:items-center">
              <Maximize2 className="size-5 shrink-0 text-amber-700 max-sm:hidden" aria-hidden />
              <p className="min-w-0 flex-1 text-sm text-amber-900">{tt.banner(wide.length)}</p>
              <button type="button" className="btn btn-primary btn-sm min-h-11 shrink-0" onClick={() => void showWhole(wide)}>
                {tt.bannerYes}
              </button>
            </div>
          ) : null}

          <div className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {visibleFilters(counts, filter).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={cn("flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium ring-1 transition", filter === f ? "bg-ink text-white ring-ink" : "bg-white text-ink-soft ring-line hover:bg-cream/50")}
              >
                {tt.filters[f]}
                <span className={cn("tabular-nums", filter === f ? "text-white/70" : "text-muted")}>{counts[f]}</span>
              </button>
            ))}
          </div>
          {sortable && photos.length > 1 ? <p className="mt-3 text-xs text-muted">{t.reorder}</p> : null}

          <DndContext id="photos-dnd" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={shown.map((p) => p.id)} strategy={rectSortingStrategy}>
              <div className={cn("mt-4 grid grid-cols-[minmax(0,1fr)] gap-3 rounded-3xl sm:grid-cols-2 sm:gap-5 lg:grid-cols-3", dragOver && "outline-2 outline-offset-8 outline-wine outline-dashed")}>
                {shown.map((p) => {
                  const place = ed.places.get(p.id);
                  const layout: PhotoLayout = p.layout ?? "full";
                  const frame = cropFrameOf(place, layout, fmt, design);
                  // Чёткость — по кадру места (фото главы, лист под обрез, клетка сетки), иначе — по виду на странице.
                  const dpi = place?.kind === "off" ? Infinity : frame ? effectiveDpi(p, frame, "cover") : effectiveDpi(p, photoAreaMm(fmt, layout), layout === "bleed" ? "cover" : "contain");
                  return (
                    <SortablePhoto key={p.id} id={p.id} disabled={!sortable}>
                      {(handle) => (
                        <PhotoCard
                          photo={p}
                          index={photos.indexOf(p)}
                          place={place}
                          names={names}
                          blank={book.blank}
                          openerDesign={openerDesign}
                          loss={loss(p)}
                          lowRes={dpi < 150 ? t.dpi(dpi) : null}
                          canCrop={!!frame}
                          editable={editable}
                          handle={sortable ? handle : null}
                          onPlace={() => setPlaceFor(p.id)}
                          onDelete={() => void remove(p)}
                          onLayout={(l) => void ed.edit(p.id, { layout: l })}
                          onCaption={(caption) => void ed.edit(p.id, { caption })}
                          onCrop={() => frame && setCropping({ photo: p, frame })}
                          onShowWhole={() => void showWhole([p.id])}
                        />
                      )}
                    </SortablePhoto>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}

      {placeFor ? <PlaceSheet data={ed.view} on={ed.relay} photoId={placeFor} onClose={() => setPlaceFor(null)} /> : null}
      {gallery ? <GallerySheet data={ed.view} on={ed.relay} onClose={() => setGallery(false)} /> : null}
      {cropping ? (
        <CropDialog
          photo={cropping.photo}
          crop={cropping.photo.crop ?? null}
          frame={cropping.frame}
          onClose={() => setCropping(null)}
          onSave={(crop) => {
            void ed.edit(cropping.photo.id, { crop });
            setCropping(null);
          }}
        />
      ) : null}
    </div>
  );
}

function SortablePhoto({ id, disabled, children }: { id: string; disabled: boolean; children: (handle: Record<string, unknown>) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined }}
      className={cn("min-w-0", isDragging && "opacity-80 shadow-lift")}
    >
      {children({ ...attributes, ...listeners })}
    </div>
  );
}
