"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ToolHeader } from "../ToolHeader";
import { useRouter } from "next/navigation";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRight, ImagePlus, Images, LayoutGrid, ListChecks, LoaderCircle, Maximize2 } from "lucide-react";
import { confirmDialog, toast } from "@/components/ui/overlays";
import { apiFetch } from "@/lib/client-api";
import { useMessages } from "@/i18n/client";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { getFormat } from "@/lib/book/formats";
import { effectiveDpi, photoAreaMm } from "@/lib/book/layout";
import type { PlaceFrame } from "@/lib/book/photo-pages";
import { cn } from "@/lib/class-names";
import { CropDialog } from "@/components/editor/CropDialog";
import { PhotoEditor } from "@/components/photo-editor/PhotoEditor";
import { patchPhotos, PHOTO_ACCEPT } from "@/components/editor/photos/api";
import { albumPhotos, galleryTitleOf, type PlaceData, type SheetPhoto } from "@/components/editor/photos/model";
import { GallerySheet } from "@/components/editor/photos/GallerySheet";
import { placeText } from "@/components/editor/photos/PlaceBadge";
import { PlaceSheet } from "@/components/editor/photos/PlaceSheet";
import { Sheet } from "@/components/editor/photos/Sheet";
import { usePlaceEditing } from "@/components/editor/photos/usePlaceEditing";
import { BookRules } from "./BookRules";
import { PhotoPanel } from "./PhotoPanel";
import { PhotoTile } from "./PhotoTile";
import { BANNER_MIN, cropFrameOf, deleteDialogOf, filterCounts, groupByPlace, lossOf, matchesFilter, placeTotals, visibleFilters, wideBleedIds, type PhotoFilter, type PhotoLayout, type PhotosTabData } from "./photos-tab";

type View = "grid" | "chapters";

/** Галерея: две колонки на телефоне, три-четыре на планшете; справа от неё на компьютере остаётся колонка настроек. */
const GRID = "grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4";

const DESKTOP = "(min-width: 1024px)";
const watchDesktop = (onChange: () => void) => {
  const mq = window.matchMedia(DESKTOP);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};
/** Компьютер или телефон: настройки фото — справа или шторкой снизу (на сервере и до гидрации — телефон). */
const useDesktop = () =>
  useSyncExternalStore(
    watchDesktop,
    () => window.matchMedia(DESKTOP).matches,
    () => false,
  );

/**
 * Вкладка «Фото»: галерея, в которой у каждого фото подписано, где оно в книге. Нажатие на фото открывает его настройки
 * (справа на компьютере, шторкой на телефоне): «Где в книге» — лист места, вид на странице, подпись, «Кадр», редактор фото,
 * повернуть, удалить; пока ничего не выбрано, справа — правила книги (фото без места, альбом в конце). Сверху — итоги,
 * совет «Показать целиком» для фото «До краёв» с заметной обрезкой (одним пакетом, одна отмена) и фильтры; удаление
 * спрашивает с учётом обложки и главы и всегда предлагает вариант без удаления.
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
  // Перевод книги на правила раскладки 2 перед первой правкой места (onLayout) — тоже перечитать: места и порядок.
  const ed = usePlaceEditing(placeData, { onPhotos: refresh, onUploaded: refresh, onBook: refresh, onOrder: refresh, onLayout: refresh });
  const { book, design, names } = ed;
  const editable = book.editable;
  const fmt = getFormat(book.format);
  const openerDesign = !!design.opener.photo;
  const desktop = useDesktop();

  const [filter, setFilter] = useState<PhotoFilter>(initialFilter);
  const [view, setView] = useState<View>("grid");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [placeFor, setPlaceFor] = useState<string | null>(null);
  const [gallery, setGallery] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [cropping, setCropping] = useState<{ photo: SheetPhoto; frame: PlaceFrame } | null>(null);
  // Фото в редакторе фото; после сохранения страница пересобирается — размеры, обрезка и места снова точные.
  const [editing, setEditing] = useState<string | null>(null);
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
  const totals = placeTotals(photos, ed.places);
  const shown = photos.filter((p) => matchesFilter(filter, ed.places.get(p.id), loss(p)));
  const wide = wideBleedIds(photos, ed.places, lossById);
  const printed = data.chapters.some((c) => c.printed);
  const sortable = editable && filter === "all" && view === "grid";
  const galleryTitle = galleryTitleOf(ed.tocLines, book.galleryTitle);
  const album = albumPhotos(photos, ed.places).length;
  const selected = selectedId ? photos.find((p) => p.id === selectedId) : undefined;
  const groups = useMemo(() => (view === "chapters" ? groupByPlace(shown, ed.places, data.chapters.map((c) => c.key)) : []), [view, shown, ed.places, data.chapters]);

  const pick = () => input.current?.click();
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
      // Пакет переводит книгу с прежними правилами на правила 2 — вкладка всё равно перечитывает страницу (onPhotos).
      ed.relay.onPhotos((await patchPhotos(book.id, ids.map((id) => ({ id, patch: { layout: "full" as const } })))).photos);
      ed.setError(false);
    } catch {
      ed.setError(true);
      return;
    }
    toast(tt.toastWhole(ids.length), "success", { action: { label: tt.undo, run: async () => ed.relay.onPhotos((await patchPhotos(book.id, before.map(({ id, layout }) => ({ id, patch: { layout } })))).photos) } });
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
    if (selectedId === p.id) setSelectedId(null);
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

  /** «Повернуть»: файл поворачивается на сервере, версия картинки меняется — страница перечитывается. */
  const rotate = async (id: string) => {
    try {
      await apiFetch(`/api/books/${book.id}/photos/${id}/rotate`, { method: "POST" });
      refresh();
    } catch (e) {
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
  const ruleName = tt.rule[ed.photoPlacement].title;
  const uploadLabel = ed.uploading ? t.uploading(ed.uploading.done, ed.uploading.total) : t.add;

  const rules = (variant: "aside" | "sheet") => (
    <BookRules
      variant={variant}
      value={ed.photoPlacement}
      gallery={galleryTitle}
      blank={book.blank}
      noChapters={!printed}
      editable={editable}
      album={album}
      onChange={(photoPlacement) => void ed.saveBook({ photoPlacement })}
      onAlbum={() => setGallery(true)}
    />
  );

  /** Настройки выбранного фото: одни и те же справа и в шторке. */
  const panel = (p: SheetPhoto, variant: "aside" | "sheet") => {
    const place = ed.places.get(p.id);
    const layout: PhotoLayout = p.layout ?? "full";
    const frame = cropFrameOf(place, layout, fmt, design);
    // Чёткость — по кадру места (фото главы, лист под обрез, клетка сетки), иначе — по виду на странице.
    const dpi = place?.kind === "off" ? Infinity : frame ? effectiveDpi(p, frame, "cover") : effectiveDpi(p, photoAreaMm(fmt, layout), layout === "bleed" ? "cover" : "contain");
    return (
      <PhotoPanel
        variant={variant}
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
        ruleName={ruleName}
        version={server.get(p.id)?.version}
        edited={server.get(p.id)?.edited}
        onClose={() => setSelectedId(null)}
        onPlace={() => setPlaceFor(p.id)}
        onRules={() => (desktop ? setSelectedId(null) : (setSelectedId(null), setRulesOpen(true)))}
        onDelete={() => void remove(p)}
        onLayout={(l) => void ed.edit(p.id, { layout: l })}
        onCaption={(caption) => void ed.edit(p.id, { caption })}
        onCrop={() => frame && setCropping({ photo: p, frame })}
        onShowWhole={() => void showWhole([p.id])}
        onRotate={() => rotate(p.id)}
        onEditPhoto={() => setEditing(p.id)}
      />
    );
  };

  const tile = (p: SheetPhoto) => {
    const place = ed.places.get(p.id);
    const layout: PhotoLayout = p.layout ?? "full";
    const frame = cropFrameOf(place, layout, fmt, design);
    const dpi = place?.kind === "off" ? Infinity : frame ? effectiveDpi(p, frame, "cover") : effectiveDpi(p, photoAreaMm(fmt, layout), layout === "bleed" ? "cover" : "contain");
    return (
      <SortablePhoto key={p.id} id={p.id} disabled={!sortable}>
        {(handle) => (
          <PhotoTile
            photo={p}
            index={photos.indexOf(p)}
            place={place}
            names={names}
            blank={book.blank}
            openerDesign={openerDesign}
            loss={loss(p)}
            lowRes={dpi < 150 ? t.dpi(dpi) : null}
            selected={selectedId === p.id}
            editable={editable}
            handle={sortable ? handle : null}
            onSelect={() => setSelectedId((id) => (id === p.id ? null : p.id))}
            onEdit={() => setEditing(p.id)}
            onDelete={() => void remove(p)}
            version={server.get(p.id)?.version}
            edited={server.get(p.id)?.edited}
          />
        )}
      </SortablePhoto>
    );
  };

  const groupTitle = (g: (typeof groups)[number]) => {
    if (g.kind === "album") return tt.groups.album(galleryTitle);
    if (g.kind === "off") return tt.groups.off;
    const c = data.chapters.find((x) => x.key === g.chapterKey);
    const title = c?.title || names.chapter(g.chapterKey ?? "");
    return c?.number ? `${m.editor.chapter(c.number)} · ${title}` : title;
  };

  return (
    <div
      onDragOver={(e) => {
        if (!editable || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        // dragleave приходит и при переходе на вложенный элемент — гасим подсветку, только когда курсор ушёл со страницы.
        if (!e.relatedTarget) setDragOver(false);
      }}
      onDrop={(e) => {
        if (!editable || !e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragOver(false);
        void upload([...e.dataTransfer.files]);
      }}
    >
      {editable ? <input ref={input} type="file" accept={PHOTO_ACCEPT} multiple className="hidden" onChange={(e) => void upload([...(e.target.files ?? [])])} /> : null}
      <ToolHeader
        title={t.title}
        description={photos.length ? tt.intro : t.intro}
        actions={
          // Пока фото нет, главное действие — в самой зоне загрузки ниже: две винные кнопки на экране не нужны.
          // На телефоне «Добавить фото» — в нижней панели, у большого пальца.
          editable && photos.length ? (
            <button className="btn btn-primary max-lg:hidden" onClick={pick} disabled={!!ed.uploading}>
              {ed.uploading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
              {uploadLabel}
            </button>
          ) : null
        }
      />

      {ed.uploading ? (
        <div role="progressbar" aria-label={uploadLabel} aria-valuemin={0} aria-valuemax={ed.uploading.total} aria-valuenow={ed.uploading.done} className="-mt-3 mb-5 h-1 overflow-hidden rounded-full bg-line">
          <div className="h-full bg-wine transition-[width] duration-300" style={{ width: `${Math.max(6, (ed.uploading.done / Math.max(1, ed.uploading.total)) * 100)}%` }} />
        </div>
      ) : null}

      {notes.length ? (
        <Alert className="mb-5">
          {notes.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </Alert>
      ) : null}

      {photos.length === 0 ? (
        <div className={cn("rounded-[var(--r-panel)] border border-dashed transition-colors", dragOver ? "border-wine bg-rose/50" : "border-line-strong bg-white/50")}>
          <EmptyState
            icon={ed.uploading ? LoaderCircle : ImagePlus}
            title={t.empty}
            className="py-16 sm:py-24"
            action={
              editable ? (
                <button className="btn btn-primary mt-2" onClick={pick} disabled={!!ed.uploading}>
                  <ImagePlus className="size-4" aria-hidden /> {ed.uploading ? t.uploading(ed.uploading.done, ed.uploading.total) : t.choose}
                </button>
              ) : null
            }
          >
            {t.emptyText}
          </EmptyState>
        </div>
      ) : (
        <>
          {/* Итоги: сколько фото выбрано автором, сколько встало само и сколько не печатается. */}
          <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-y border-line py-3 sm:items-stretch sm:gap-x-0 sm:py-3.5" aria-label={tt.summary.total}>
            {(
              [
                ["total", totals.total],
                ["placed", totals.placed],
                ["auto", totals.auto],
                ["off", totals.off],
              ] as const
            ).map(([k, n]) => (
              <div key={k} className="flex min-w-0 flex-row-reverse items-baseline justify-end gap-1.5 sm:flex-col-reverse sm:items-stretch sm:gap-1 sm:pr-8 sm:not-first:border-l sm:not-first:border-line sm:not-first:pl-8">
                <dt className="text-[13px] text-muted">{tt.summary[k]}</dt>
                <dd className="text-[15px] leading-none font-semibold tabular-nums sm:text-2xl sm:font-medium">{n}</dd>
              </div>
            ))}
          </dl>

          {wide.length >= BANNER_MIN && editable ? (
            <div className="mt-4 flex flex-col gap-3 rounded-[var(--r-panel)] bg-warning-bg p-4 sm:flex-row sm:items-center">
              <Maximize2 className="size-5 shrink-0 text-warning max-sm:hidden" aria-hidden />
              <p className="min-w-0 flex-1 text-sm text-warning">{tt.banner(wide.length)}</p>
              <button type="button" className="btn btn-outline shrink-0" onClick={() => void showWhole(wide)}>
                {tt.bannerYes}
              </button>
            </div>
          ) : null}

          <div className="mt-5 grid gap-x-8 gap-y-4 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-x-4 gap-y-2.5">
                <div className="no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto pb-0.5 sm:flex-wrap">
                  {visibleFilters(counts, filter).map((f) => (
                    <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className="chip shrink-0 max-sm:h-11">
                      {tt.filters[f]}
                      <span className="tabular-nums opacity-60">{counts[f]}</span>
                    </button>
                  ))}
                </div>
                <div role="group" aria-label={tt.views.label} className="flex shrink-0 gap-0.5 rounded-[var(--r-ctl)] bg-sunken p-0.5">
                  {(
                    [
                      ["grid", tt.views.grid, LayoutGrid],
                      ["chapters", tt.views.chapters, ListChecks],
                    ] as const
                  ).map(([v, label, Icon]) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={view === v}
                      aria-label={label}
                      title={label}
                      onClick={() => setView(v)}
                      className={cn(
                        "flex h-9 items-center gap-1.5 rounded-[calc(var(--r-ctl)-2px)] px-3 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-wine max-sm:h-10 max-sm:w-10 max-sm:justify-center max-sm:px-0",
                        view === v ? "bg-white text-ink ring-1 ring-line" : "text-muted hover:text-ink",
                      )}
                    >
                      <Icon className="size-4 sm:size-3.5" aria-hidden /> <span className="max-sm:sr-only">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Телефон: правило для фото без места — строкой над галереей, настраивается в шторке. */}
              <button
                type="button"
                onClick={() => setRulesOpen(true)}
                className="mt-3 flex min-h-12 w-full items-center gap-3 rounded-[var(--r-ctl)] border border-line bg-white px-3 text-left focus-visible:outline-2 focus-visible:outline-wine lg:hidden"
              >
                <Images className="size-4 shrink-0 text-wine" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-muted">{tt.rule.title}</span>
                  <span className="block truncate text-sm font-medium">{ruleName}</span>
                </span>
                <span className="flex shrink-0 items-center gap-0.5 text-sm font-medium text-wine">
                  {tt.rulesChange} <ChevronRight className="size-4" aria-hidden />
                </span>
              </button>

              {sortable && photos.length > 1 ? <p className="mt-3 text-xs text-muted max-sm:hidden">{t.reorder}</p> : null}

              <DndContext id="photos-dnd" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={shown.map((p) => p.id)} strategy={rectSortingStrategy}>
                  {shown.length === 0 ? (
                    <EmptyState compact title={tt.noMatch} className="mt-4 rounded-[var(--r-panel)] border border-dashed border-line-strong" action={<button className="btn btn-outline btn-sm" onClick={() => setFilter("all")}>{tt.showAll}</button>} />
                  ) : view === "grid" ? (
                    <div className={cn("mt-5", GRID)}>{shown.map(tile)}</div>
                  ) : (
                    <div className="mt-5 space-y-8">
                      {groups.map((g) => (
                        <section key={g.id} aria-label={groupTitle(g)}>
                          <h3 className="mb-3 flex items-baseline gap-2 border-b border-line pb-2 text-[15px] font-semibold">
                            <span className="min-w-0 truncate">{groupTitle(g)}</span>
                            <span className="count">{g.photos.length}</span>
                          </h3>
                          <div className={GRID}>{g.photos.map(tile)}</div>
                        </section>
                      ))}
                    </div>
                  )}
                </SortableContext>
              </DndContext>
            </div>

            <aside className="hidden lg:block" aria-label={selected ? t.title : tt.rule.title}>
              <div className="sticky top-20 max-h-[calc(100dvh-6.5rem)] overflow-y-auto pb-2">{selected && desktop ? panel(selected, "aside") : rules("aside")}</div>
            </aside>
          </div>
        </>
      )}

      {/* Телефон: «Добавить фото» — внизу, у большого пальца; помощник встаёт над панелью. */}
      {editable && photos.length ? (
        <div data-bottom-bar className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper px-4 pt-3 lg:hidden" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <button className="btn btn-primary w-full" onClick={pick} disabled={!!ed.uploading}>
            {ed.uploading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
            {uploadLabel}
          </button>
        </div>
      ) : null}

      {dragOver && editable ? (
        <div className="pointer-events-none fixed inset-3 z-[60] flex items-center justify-center rounded-[var(--r-sheet)] border-2 border-dashed border-wine bg-paper/85 text-lg font-medium text-wine" role="status">
          {tt.drop}
        </div>
      ) : null}

      {selected && !desktop ? (
        <Sheet
          title={tt.panel.title(photos.indexOf(selected) + 1)}
          onClose={() => setSelectedId(null)}
          closeLabel={tt.panel.close}
          footer={
            <button type="button" className="btn btn-primary w-full" onClick={() => setSelectedId(null)}>
              {m.editor.chapterPhoto.done}
            </button>
          }
        >
          {panel(selected, "sheet")}
        </Sheet>
      ) : null}
      {rulesOpen ? (
        <Sheet
          title={tt.rule.title}
          onClose={() => setRulesOpen(false)}
          closeLabel={m.editor.chapterPhoto.close}
          footer={
            <button type="button" className="btn btn-primary w-full" onClick={() => setRulesOpen(false)}>
              {m.editor.chapterPhoto.done}
            </button>
          }
        >
          {rules("sheet")}
        </Sheet>
      ) : null}

      {placeFor ? <PlaceSheet data={ed.view} on={ed.relay} photoId={placeFor} onClose={() => setPlaceFor(null)} /> : null}
      {gallery ? <GallerySheet data={ed.view} on={ed.relay} onClose={() => setGallery(false)} /> : null}
      {editing ? <PhotoEditor bookId={book.id} photoId={editing} onClose={() => setEditing(null)} onSaved={refresh} /> : null}
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
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined }} className={cn("min-w-0", isDragging && "opacity-80")}>
      {children({ ...attributes, ...listeners })}
    </div>
  );
}
