"use client";

import { Link, useLocale, useMessages } from "@/i18n/client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ImagePlus, Layers, Sparkles } from "lucide-react";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { backPreviewLayout, CoverBackPreview } from "@/components/cover/CoverBackPreview";
import { FrameControls, FrameLayer, type FrameSlot } from "@/components/cover/FrameEditor";
import { DEFAULT_FRAME, frameKey, isDefaultFrame, type FrameMap, type PhotoFrame } from "@/lib/book/photo-frame";
import { backSlotBoxes, frontSlotBoxes } from "@/lib/book/photo-slots";
import { backPhotoRefs, coverPhotoRefs } from "@/lib/book/photo-refs";
import { BACK_PHOTO_SLOTS, type BackLayout } from "@/lib/book/cover-back";
import { BackSection } from "./BackSection";
import { InteriorSpread, type SpreadSample } from "@/components/interior/InteriorSpread";
import { SaveIndicator } from "@/components/SaveIndicator";
import { PreviewDock, useScrolledPast } from "@/components/PreviewDock";
import { useAutosave } from "@/hooks/useAutosave";
import { apiFetch } from "@/lib/client-api";
import { coverLabel, coverMoods, coverPhotoSlots, getCoverTemplate, pickerCovers, type CoverMood } from "@/lib/book/covers";
import { coverNames, NAMES_ON_COVER_MAX } from "@/lib/book/cover-names";
import { bookKind, RECORDED_BY_MAX } from "@/lib/content/kinds";
import { getFormat } from "@/lib/book/formats";
import { getInteriorDesign, interiorsForCover } from "@/lib/book/interiors";
import { photoUrl, photoUrls } from "@/lib/urls";
import { cn } from "@/lib/class-names";
import type { PhotoPlace } from "@/lib/book/photo-place";
import { PlaceBadge } from "@/components/editor/photos/PlaceBadge";
import { placeNames, type PlaceNames } from "@/components/editor/photos/model";
import { coverFillOrder, withCoverNow } from "./cover-fill";

/** Фото книги для обложки: размеры и отметка «фото главы» (подпись места в оформлении без фото главы). */
type CoverPhoto = { id: string; width: number; height: number; opener?: boolean };

/** Снимки обложки и оборота в настройках книги: правка любого — сервер пересобирает книгу и места фото. */
const PHOTO_FIELDS = ["coverTemplate", "coverPhotoId", "coverPhotoExtra", "backLayout", "backPhotoId", "backPhotoExtra"] as const;
import { designFromTemplate, type CoverDesign, type TextBind } from "@/lib/book/cover-design";
import { coverMeta } from "@/lib/book/covers/meta";
import { CoverDesigner } from "@/components/cover/designer/CoverDesigner";
import { CoverLayoutPicker } from "@/components/cover/CoverLayoutPicker";

interface CoverState {
  coverTemplate: string;
  title: string;
  subtitle: string;
  authorName: string;
  /** Автобиография: кто записал со слов рассказчика. */
  recordedBy: string;
  recipientName: string;
  hideRecipientOnCover: boolean;
  /** Своя строка имён на обложке; пусто — «Автор & Получатель». */
  namesOnCover: string;
  backText: string;
  backLayout: BackLayout;
  backPhotoId: string | null;
  /** Остальные фото оборота «Полароиды». */
  backPhotoExtra: string[];
  coverPhotoId: string | null;
  /** Остальные фото обложек на несколько снимков, по порядку мест. */
  coverPhotoExtra: string[];
  /** Оформление страниц: здесь его можно сменить на подходящее к обложке одной кнопкой. */
  interior: string;
  /** Кадры фото на обложке (масштаб и положение) по местам: «cover:0», «back:1». */
  photoFrames: FrameMap;
  /** Обложка из конструктора (слои поверх шаблона); null — обложка шаблона. */
  coverDesign: CoverDesign | null;
}

export function CoverEditor({
  bookId,
  format,
  initial,
  photos,
  recipientLabel,
  editable,
  sample,
  theme,
  year,
  places: placeList = [],
  placeNames: nameLists = { chapters: [], answers: [] },
  blank = false,
}: {
  bookId: string;
  format: string;
  /** Тема книги — для готовых фраз на обороте. */
  theme: string;
  /** Год на обороте в варианте «Лаконично»: повода или текущий. */
  year: number;
  initial: CoverState;
  /** Содержимое книги для мини-разворота «страницы в пару». */
  sample: SpreadSample;
  photos: CoverPhoto[];
  recipientLabel: string;
  editable: boolean;
  /** Где каждое фото в книге (photoPlaceOf по сборке сервера) — парами [id, место]. */
  places?: [string, PhotoPlace][];
  /** Названия глав и ответов для подписей мест. */
  placeNames?: { chapters: { key: string; title: string }[]; answers: { id: string; title: string }[] };
  /** Своя книга: «раздел» вместо «ответ». */
  blank?: boolean;
}) {
  const [state, setState] = useState(initial);
  const router = useRouter();
  const places = useMemo(() => new Map(placeList), [placeList]);
  const names = useMemo(() => placeNames(nameLists.chapters, nameLists.answers), [nameLists]);
  const m = useMessages();
  const locale = useLocale();
  const t = m.books.cover;
  const strip = useRef<HTMLDivElement>(null);
  const changes = useRef<Partial<CoverState>>({});
  const { status, error, schedule } = useAutosave<null>(async () => {
    const patch = changes.current;
    changes.current = {};
    if (!Object.keys(patch).length) return;
    try {
      await apiFetch(`/api/books/${bookId}`, { method: "PATCH", json: patch });
    } catch (e) {
      changes.current = { ...patch, ...changes.current };
      throw e;
    }
    // Другие снимки на обложке — сервер пересоберёт книгу: подписи мест под фото снова точные.
    if (PHOTO_FIELDS.some((k) => k in patch)) router.refresh();
  }, 700);

  /** Поставили другое фото на место — прежний кадр (масштаб, сдвиг) к нему не подходит: сбрасываем, как это делает и сервер. */
  const withFrameReset = (s: CoverState, patch: Partial<CoverState>): Partial<CoverState> => {
    if (patch.photoFrames) return patch;
    const next = { ...s, ...patch };
    const ids = (c: CoverState) => ({ cover: [c.coverPhotoId, ...c.coverPhotoExtra], back: [c.backPhotoId, ...c.backPhotoExtra] });
    const before = ids(s);
    const after = ids(next);
    let frames = s.photoFrames;
    for (const side of ["cover", "back"] as const)
      for (let i = 0; i < Math.max(before[side].length, after[side].length); i++) {
        const key = frameKey(side, i);
        if ((before[side][i] ?? null) !== (after[side][i] ?? null) && frames[key]) {
          frames = { ...frames };
          delete frames[key];
        }
      }
    return frames === s.photoFrames ? patch : { ...patch, photoFrames: frames };
  };

  const update = (raw: Partial<CoverState>) => {
    if (!editable) return;
    const patch = withFrameReset(state, raw);
    setState((s) => ({ ...s, ...patch }));
    changes.current = { ...changes.current, ...patch };
    schedule(null);
  };

  /** Кадр фото на обложке: «по умолчанию» не храним. */
  const setFrame = (key: string, frame: PhotoFrame) => {
    const frames = { ...state.photoFrames };
    if (isDefaultFrame(frame)) delete frames[key];
    else frames[key] = frame;
    update({ photoFrames: frames });
  };

  const choices = pickerCovers();
  const label = (t: { id: string }) => coverLabel(getCoverTemplate(t.id), m.catalog.covers, locale);

  // Порядок фото для пустых мест: сначала без выбранного места, фото главы и фото в ответах — никогда (не повторятся на обложке).
  const fillOrder = useMemo(() => coverFillOrder(photos, places), [photos, places]);
  /** Места под фото шаблона: выбранные снимки, пустые — заполняем ещё не занятыми фото книги. */
  const fillSlots = (templateId: string, s: Pick<CoverState, "coverPhotoId" | "coverPhotoExtra">) => {
    const n = coverPhotoSlots(getCoverTemplate(templateId));
    const ids: (string | null)[] = [s.coverPhotoId, ...s.coverPhotoExtra];
    const free = fillOrder.filter((id) => !ids.includes(id));
    for (let i = 0; i < n; i++) if (!ids[i]) ids[i] = free.shift() ?? null;
    return { coverPhotoId: ids[0] ?? null, coverPhotoExtra: ids.slice(1).filter((id): id is string => !!id) };
  };
  const chooseTemplate = (id: string) => {
    const filled = fillSlots(id, state);
    const changed = filled.coverPhotoId !== state.coverPhotoId || filled.coverPhotoExtra.join() !== state.coverPhotoExtra.join();
    update(changed ? { coverTemplate: id, ...filled } : { coverTemplate: id });
  };

  /** Как шаблон выглядел бы с фото книги — для миниатюр в выборе. */
  const slotUrls = (templateId: string) => {
    const f = fillSlots(templateId, state);
    return photoUrls([f.coverPhotoId, ...f.coverPhotoExtra].slice(0, coverPhotoSlots(getCoverTemplate(templateId))));
  };

  const template = getCoverTemplate(state.coverTemplate);
  const slots = coverPhotoSlots(template);
  const [mood, setMood] = useState<CoverMood | "all">("all");
  const kind = bookKind(theme);
  const coverNamesLine = coverNames({ theme, ...state });
  const coverIds = [state.coverPhotoId, ...state.coverPhotoExtra].slice(0, slots);
  const coverPhotos = coverPhotoRefs(coverIds, photos, state, "view");
  const [side, setSide] = useState<"front" | "back">("front");
  const [frameSel, setFrameSel] = useState<string | null>(null);
  const backPhotos = [state.backPhotoId, ...state.backPhotoExtra].flatMap((id) => photos.filter((p) => p.id === id));
  const backContent = {
    layout: state.backLayout,
    text: state.backText,
    signature: state.authorName.trim(),
    names: coverNamesLine,
    year,
    photos: backPhotos.map((p) => ({ width: p.width, height: p.height })),
  };
  // Места под фото на превью: по ним поверх снимков ложится управление кадром (перетащить, увеличить).
  const frontBoxes = useMemo(() => (template.requiresPhoto ? frontSlotBoxes(template, getFormat(format)) : []), [template, format]);
  const frontSlots: FrameSlot[] = frontBoxes.flatMap((b) => {
    const p = coverIds[b.slot] ? photos.find((x) => x.id === coverIds[b.slot]) : undefined;
    const key = frameKey("cover", b.slot);
    return p ? [{ ...b, key, photo: { width: p.width, height: p.height }, frame: state.photoFrames[key] ?? DEFAULT_FRAME }] : [];
  });
  const backLayoutInfo = backPreviewLayout(state.coverTemplate, format, backContent);
  const backSlots: FrameSlot[] = backSlotBoxes(backLayoutInfo.design, backLayoutInfo.back.w, backLayoutInfo.back.h).flatMap((b) => {
    const p = backPhotos[b.slot];
    const key = frameKey("back", b.slot);
    return p ? [{ ...b, key, photo: { width: p.width, height: p.height }, frame: state.photoFrames[key] ?? DEFAULT_FRAME }] : [];
  });
  // Обложка из конструктора: кадр фото в местах шаблона правится в самом конструкторе — здесь только оборот.
  const frameSlots = side === "back" ? backSlots : state.coverDesign ? [] : frontSlots;
  const frameSelected = frameSlots.some((s) => s.key === frameSel) ? frameSel : (frameSlots[0]?.key ?? null);
  const bigPreview = useRef<HTMLDivElement>(null);
  const scrolled = useScrolledPast(bigPreview);

  /** Обложка или оборот (без управления кадром) — для большого превью и для мини-копии под шапкой. */
  const renderSide = (className: string, uid: string, lite = false) =>
    side === "back" ? (
      <CoverBackPreview template={state.coverTemplate} format={format} content={backContent} photos={backPhotoRefs(backPhotos, state, "view")} className={className} />
    ) : (
      <CoverPreview
        template={state.coverTemplate}
        format={format}
        title={state.title}
        subtitle={state.subtitle}
        names={coverNamesLine}
        photos={coverPhotos}
        className={className}
        uid={uid}
        lite={lite}
        titlePlaceholder={t.bookTitle}
        photoHint={t.uploadFirst}
        design={state.coverDesign}
      />
    );
  const sideToggle = (className?: string) => (
    <div className={cn("inline-flex rounded-full bg-cream p-1 text-sm", className)} role="radiogroup" aria-label={t.side.aria}>
      {(["front", "back"] as const).map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={side === s}
          onClick={() => setSide(s)}
          className={cn("rounded-full px-4 py-1.5 transition max-lg:min-h-9", side === s ? "bg-white font-medium text-ink shadow-soft" : "text-muted hover:text-ink")}
        >
          {t.side[s]}
        </button>
      ))}
    </div>
  );

  // ─── конструктор ──────────────────────────────────────────────────────────
  const d = m.design.cover;
  const [view, setView] = useState<"template" | "designer">(initial.coverDesign ? "designer" : "template");
  /** Новый ключ — конструктор начинается заново (после сброса или новой обложки из шаблона). */
  const [designerKey, setDesignerKey] = useState(0);
  const designTexts = { title: state.title, subtitle: state.subtitle, names: coverNamesLine };
  /** Правка привязанной надписи на обложке — это правка поля книги. */
  const setBookText = (bind: TextBind, value: string) => update(bind === "names" ? { namesOnCover: value } : bind === "title" ? { title: value.slice(0, 80) } : { subtitle: value.slice(0, 80) });
  /** В конструктор: обложки из слоёв ещё нет — она собирается из текущего шаблона, на тех же местах. */
  const openDesigner = () => {
    if (!state.coverDesign) {
      if (!editable) return;
      update({ coverDesign: designFromTemplate(coverMeta(template), { title: state.title, subtitle: state.subtitle, names: coverNamesLine }, getFormat(format)) });
      setDesignerKey((k) => k + 1);
    }
    setView("designer");
  };
  const resetDesign = () => {
    if (!window.confirm(d.active.confirmReset)) return;
    update({ coverDesign: null });
    setDesignerKey((k) => k + 1);
    setView("template");
  };

  const templateView = (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:gap-14">
      <PreviewDock show={scrolled}>
        <div className="shrink-0" style={{ width: 68 }}>{renderSide("rounded-[3px] shadow-soft", "mini", true)}</div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2 text-sm text-muted">
            <span className="truncate font-medium text-ink">{label(template)}</span>·<SaveIndicator status={status} error={error} className="shrink-0 text-xs" />
          </div>
          {sideToggle()}
        </div>
      </PreviewDock>
      <div>
        <div className="lg:sticky lg:top-24">
          <div className="mb-4 flex justify-center">{sideToggle()}</div>
          <div ref={bigPreview} className="mx-auto w-full max-w-[300px] rounded-[28px] bg-cream/70 p-5 sm:max-w-[340px] sm:p-8">
            <div className="relative">
              {renderSide("rounded-[4px] shadow-book", "editor")}
              {editable && frameSlots.length ? <FrameLayer slots={frameSlots} selected={frameSelected} onSelect={setFrameSel} onChange={setFrame} ariaLabel={t.frame.aria} /> : null}
            </div>
          </div>
          {editable && frameSlots.length ? <FrameControls slots={frameSlots} selected={frameSelected} onSelect={setFrameSel} onChange={setFrame} labels={{ ...t.frame, hintTouch: m.books.coverPhotos.frameHintTouch }} /> : null}
          <div className="mt-4 flex items-center justify-center gap-3 text-sm text-muted">
            <span className="font-medium text-ink">{label(template)}</span>·<SaveIndicator status={status} error={error} />
          </div>
        </div>
      </div>

      <div className="space-y-8">
        {state.coverDesign ? (
          <section className="flex flex-col gap-3 rounded-2xl border border-wine/20 bg-rose/40 p-5 sm:flex-row sm:items-center">
            <Layers className="size-6 shrink-0 text-wine" />
            <p className="min-w-0 flex-1 text-sm text-ink-soft">{d.active.text}</p>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button type="button" className="btn btn-primary btn-sm" onClick={openDesigner}>
                {d.active.open}
              </button>
              {editable ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={resetDesign}>
                  {d.active.reset}
                </button>
              ) : null}
            </div>
          </section>
        ) : editable ? (
          <section className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5 sm:flex-row sm:items-center">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-rose text-wine">
              <Layers className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{d.cta.title}</div>
              <p className="mt-0.5 text-sm text-muted">{d.cta.text}</p>
            </div>
            <button type="button" className="btn btn-dark btn-sm shrink-0" onClick={openDesigner}>
              {d.cta.open}
            </button>
          </section>
        ) : null}
        <section>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{t.design}</h2>
            <span className="text-xs text-muted">{m.common.count.variants(choices.length)}</span>
          </div>
          {/* Фильтр по настроению — чтобы 20+ обложек не превращались в стену */}
          <div className="no-scrollbar -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label={t.moodAria}>
            {(["all", ...coverMoods] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={mood === id}
                onClick={() => setMood(id)}
                className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-sm transition", mood === id ? "bg-ink text-white" : "bg-white text-ink-soft ring-1 ring-line hover:ring-ink/30")}
              >
                {m.catalog.moods[id]}
              </button>
            ))}
          </div>
          <div ref={strip} className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6">
            {choices.filter((t) => mood === "all" || t.mood === mood || t.id === state.coverTemplate).map((t) => (
              <button
                key={t.id}
                onClick={() => chooseTemplate(t.id)}
                disabled={!editable}
                className="group text-left"
                aria-pressed={t.id === state.coverTemplate}
              >
                <div
                  className={cn(
                    "relative overflow-hidden rounded-[4px] ring-offset-2 ring-offset-paper transition",
                    t.id === state.coverTemplate ? "ring-2 ring-wine" : "ring-1 ring-line group-hover:-translate-y-0.5 group-hover:ring-ink/30",
                  )}
                >
                  <CoverPreview
                    template={t.id}
                    format={format}
                    title={state.title}
                    names={coverNamesLine}
                    photos={t.requiresPhoto ? slotUrls(t.id) : undefined}
                    lite
                    uid={`pick-${t.id}`}
                  />
                  {t.requiresPhoto && !photos.length ? (
                    <span className="absolute bottom-1.5 left-1.5 flex size-5 items-center justify-center rounded-full bg-black/45 text-white" aria-hidden>
                      <ImagePlus className="size-3" />
                    </span>
                  ) : null}
                  {t.id === state.coverTemplate ? (
                    <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-wine text-white">
                      <Check className="size-3" />
                    </span>
                  ) : null}
                </div>
                <div className={cn("mt-1.5 truncate text-xs", t.id === state.coverTemplate ? "font-medium text-ink" : "text-muted")}>{label(t)}</div>
              </button>
            ))}
          </div>
        </section>

        <PairedPages
          bookId={bookId}
          cover={state.coverTemplate}
          interior={state.interior}
          format={format}
          sample={sample}
          editable={editable}
          onApply={(interior) => update({ interior })}
        />

        <h2 className="text-lg font-semibold">{t.text}</h2>

        {template.requiresPhoto ? (
          <CoverPhotoPicker
            bookId={bookId}
            slots={slots}
            chosen={[state.coverPhotoId, ...state.coverPhotoExtra].slice(0, slots)}
            photos={photos}
            place={(id) => withCoverNow(places.get(id), id, coverIds, backPhotos.slice(0, BACK_PHOTO_SLOTS[state.backLayout] ?? 0).map((p) => p.id))}
            names={names}
            blank={blank}
            openerDesign={!!getInteriorDesign(state.interior).opener.photo}
            editable={editable}
            onChange={(ids) => update({ coverPhotoId: ids[0] ?? null, coverPhotoExtra: ids.slice(1).filter((id): id is string => !!id) })}
          />
        ) : null}

        <Field label={t.bookTitle} value={state.title} max={80} onChange={(v) => update({ title: v })} disabled={!editable} />
        <Field label={t.subtitle} placeholder={t.subtitlePlaceholder} value={state.subtitle} max={80} onChange={(v) => update({ subtitle: v })} disabled={!editable} />
        <Field label={kind === "autobiography" ? t.narratorName : t.authorName} value={state.authorName} max={60} onChange={(v) => update({ authorName: v })} disabled={!editable} />
        {kind === "autobiography" ? (
          <Field label={t.recordedBy} placeholder={t.recordedByPlaceholder} value={state.recordedBy} max={RECORDED_BY_MAX} onChange={(v) => update({ recordedBy: v })} disabled={!editable} />
        ) : null}
        {/* Получатель: у подарка — обязательное поле, у своей книги — «необязательно», у автобиографии его нет (посвящение — во вкладке «Страницы»). */}
        {kind !== "autobiography" ? (
          <div>
            <Field label={recipientLabel} value={state.recipientName} max={60} onChange={(v) => update({ recipientName: v })} disabled={!editable} />
            <label className="mt-3 flex items-center gap-2.5 text-sm text-ink-soft">
              <input
                type="checkbox"
                className="size-4 accent-wine"
                checked={state.hideRecipientOnCover}
                onChange={(e) => update({ hideRecipientOnCover: e.target.checked })}
                disabled={!editable}
              />
              {t.hideRecipient}
            </label>
          </div>
        ) : (
          <p className="text-sm text-muted">{t.recipientNone}</p>
        )}
        <NamesOnCover
          value={state.namesOnCover}
          auto={coverNames({ theme, ...state, namesOnCover: "" })}
          swapped={kind !== "autobiography" && state.authorName.trim() && state.recipientName.trim() ? `${state.recipientName.trim()} & ${state.authorName.trim()}` : null}
          onChange={(v) => update({ namesOnCover: v })}
          disabled={!editable}
        />
        <BackSection
          bookId={bookId}
          theme={theme}
          layout={state.backLayout}
          text={state.backText}
          photoIds={backPhotos.map((p) => p.id)}
          photos={photos}
          signature={state.authorName.trim()}
          names={coverNamesLine}
          year={year}
          editable={editable}
          onChange={(patch) => {
            // Вариант с фото без выбранных снимков — сразу подставляем первые фото книги.
            const need = patch.backLayout ? (BACK_PHOTO_SLOTS[patch.backLayout] ?? 0) : 0;
            if (need && backPhotos.length < Math.min(need, photos.length)) {
              const ids = [...backPhotos.map((p) => p.id), ...fillOrder.filter((id) => !backPhotos.some((p) => p.id === id))].slice(0, need);
              update({ ...patch, backPhotoId: ids[0] ?? null, backPhotoExtra: ids.slice(1) });
            } else update(patch);
          }}
          onFocusBack={() => setSide("back")}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label={d.tabs.aria} className="inline-flex rounded-2xl bg-cream/80 p-1">
          {(["template", "designer"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => (v === "designer" ? openDesigner() : setView("template"))}
              disabled={v === "designer" && !editable && !state.coverDesign}
              className={cn("inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm transition", view === v ? "bg-white font-medium text-ink shadow-soft" : "text-muted hover:text-ink")}
            >
              {v === "designer" ? <Layers className="size-4" /> : null}
              {d.tabs[v]}
            </button>
          ))}
        </div>
        {view === "designer" && state.coverDesign && editable ? (
          <button type="button" className="text-sm text-muted hover:text-wine hover:underline" onClick={resetDesign}>
            {d.active.reset}
          </button>
        ) : null}
      </div>
      {view === "designer" && state.coverDesign ? (
        <CoverDesigner
          key={designerKey}
          bookId={bookId}
          template={state.coverTemplate}
          format={format}
          initial={state.coverDesign}
          texts={designTexts}
          templatePhotos={coverPhotos}
          bookPhotos={photos}
          editable={editable}
          onChange={(coverDesign) => update({ coverDesign })}
          onBookText={setBookText}
          onTemplate={(coverTemplate) => update({ coverTemplate })}
          layouts={(onPick) => <CoverLayoutPicker format={format} texts={designTexts} photos={photos} currentTemplate={state.coverTemplate} onPick={onPick} />}
          status={<SaveIndicator status={status} error={error} className="text-xs" />}
        />
      ) : (
        templateView
      )}
    </div>
  );
}

/**
 * Фото для обложки: у шаблонов на несколько снимков — по местам. Щелчок по месту делает его текущим,
 * щелчок по фото ставит снимок в текущее место (если фото уже стоит в другом месте — они меняются).
 * Под каждым фото — где оно в книге (PlaceBadge): обложка снимки со страниц не забирает, а сама внутрь не повторяется.
 */
export function CoverPhotoPicker({
  bookId,
  slots,
  chosen,
  photos,
  place,
  names,
  blank,
  openerDesign,
  editable,
  onChange,
}: {
  bookId: string;
  slots: number;
  chosen: (string | null)[];
  photos: CoverPhoto[];
  /** Где фото в книге — со снимками обложки, выбранными сейчас. */
  place: (id: string) => PhotoPlace | undefined;
  names: PlaceNames;
  blank: boolean;
  openerDesign: boolean;
  editable: boolean;
  onChange: (ids: (string | null)[]) => void;
}) {
  const m = useMessages();
  const t = m.books.cover;
  const [active, setActive] = useState(0);
  const current = Math.min(active, slots - 1);
  const ids = Array.from({ length: slots }, (_, i) => chosen[i] ?? null);
  const pick = (id: string) => {
    const next = [...ids];
    const was = next.indexOf(id);
    if (was >= 0) next[was] = next[current];
    next[current] = id;
    onChange(next);
    // Дальше — к следующему пустому месту, если оно есть.
    const empty = next.findIndex((x) => !x);
    if (empty >= 0) setActive(empty);
  };
  return (
    <div>
      <span className="label">{slots > 1 ? t.photos(slots) : t.photo}</span>
      {slots > 1 ? (
        <div className="mb-3 flex flex-wrap gap-2" role="radiogroup" aria-label={t.photoSlotsAria}>
          {ids.map((id, i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={current === i}
              onClick={() => setActive(i)}
              className={cn("relative size-14 overflow-hidden rounded-lg ring-offset-2 transition", current === i ? "ring-2 ring-wine" : "ring-1 ring-line hover:ring-ink/30")}
            >
              {id ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl(id)} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-cream text-muted">
                  <ImagePlus className="size-4" />
                </span>
              )}
              <span className="absolute top-0.5 left-0.5 flex size-4 items-center justify-center rounded-full bg-black/55 text-[10px] font-medium text-white">{i + 1}</span>
            </button>
          ))}
          <p className="w-full text-xs text-muted">{t.photoSlotsHint}</p>
        </div>
      ) : null}
      {photos.length ? (
        <>
          <ul className="grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-4">
            {photos.map((p) => {
              const slot = ids.indexOf(p.id);
              return (
                <li key={p.id} className="min-w-0">
                  <button
                    type="button"
                    disabled={!editable}
                    onClick={() => pick(p.id)}
                    aria-pressed={slot >= 0}
                    className={cn("relative block aspect-square w-full overflow-hidden rounded-xl ring-offset-2", slot >= 0 ? "ring-2 ring-wine" : "ring-1 ring-line")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoUrl(p.id)} alt="" className="h-full w-full object-cover" />
                    {slot >= 0 ? (
                      <span className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-wine text-[11px] font-medium text-white">
                        {slots > 1 ? slot + 1 : <Check className="size-3" />}
                      </span>
                    ) : null}
                    {p.width < 1800 ? <span className="absolute inset-x-0 bottom-0 bg-amber-500/90 py-0.5 text-[10px] text-white">{t.lowQuality}</span> : null}
                  </button>
                  <PlaceBadge place={place(p.id)} names={names} blank={blank} marked={p.opener} openerDesign={openerDesign} className="mt-1 text-[11px]" />
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-muted">{m.books.coverPhotos.note}</p>
        </>
      ) : null}
      <Link href={`/books/${bookId}/photos`} className="mt-2 inline-flex items-center gap-1.5 text-sm text-wine hover:underline">
        <ImagePlus className="size-4" /> {photos.length ? t.uploadMore : t.uploadFirst}
      </Link>
    </div>
  );
}

/** Своя строка имён на обложке: порядок «Получатель & Автор» одной кнопкой или любой текст; пусто — как по умолчанию. */
function NamesOnCover({ value, auto, swapped, onChange, disabled }: { value: string; auto: string; swapped: string | null; onChange: (v: string) => void; disabled?: boolean }) {
  const t = useMessages().books.cover;
  return (
    <div>
      <label className="label">{t.namesOnCover}</label>
      <input className="input" value={value} maxLength={NAMES_ON_COVER_MAX} placeholder={auto} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="text-muted">{t.namesOnCoverText}</span>
        {swapped && value.trim() !== swapped ? (
          <button type="button" className="text-wine hover:underline disabled:opacity-50" onClick={() => onChange(swapped)} disabled={disabled}>
            {t.namesSwap}
          </button>
        ) : null}
        {value.trim() ? (
          <button type="button" className="text-muted hover:text-ink hover:underline disabled:opacity-50" onClick={() => onChange("")} disabled={disabled}>
            {t.namesAuto}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, max, placeholder, disabled }: { label: string; value: string; onChange: (v: string) => void; max: number; placeholder?: string; disabled?: boolean }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
    </div>
  );
}

/**
 * Связка обложки и страниц: к выбранной обложке — оформление страниц в пару. Если страницы уже
 * подходят, просто подтверждаем; если нет — показываем подходящие и меняем их одной кнопкой.
 */
function PairedPages({
  bookId,
  cover,
  interior,
  format,
  sample,
  editable,
  onApply,
}: {
  bookId: string;
  cover: string;
  interior: string;
  format: string;
  sample: SpreadSample;
  editable: boolean;
  onApply: (interior: string) => void;
}) {
  const m = useMessages();
  const locale = useLocale();
  const t = m.books.cover;
  const pairs = interiorsForCover(cover);
  if (!pairs.length) return null;
  const current = getInteriorDesign(interior);
  const matched = pairs.some((d) => d.id === current.id);
  const shown = matched ? current : pairs[0];
  const names = m.catalog.interiors;
  const coverTitle = coverLabel(getCoverTemplate(cover), m.catalog.covers, locale);
  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-line bg-white p-5 sm:flex-row sm:items-center">
      <InteriorSpread design={shown} format={getFormat(format)} sample={sample} className="w-full shrink-0 rounded-[3px] ring-1 ring-line sm:w-56" />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-xs font-medium tracking-wider text-wine uppercase">
          <Sparkles className="size-3.5" /> {t.pairTitle}
        </div>
        <p className="mt-1.5 text-sm text-ink-soft">
          {matched ? t.pairDone(names[current.id].name, coverTitle) : t.pairSuggest(coverTitle, pairs.map((d) => names[d.id].name))}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {!matched && editable ? (
            <button type="button" className="btn btn-dark btn-sm" onClick={() => onApply(shown.id)}>
              {t.pairApply(names[shown.id].name)}
            </button>
          ) : null}
          <Link href={`/books/${bookId}/pages`} className="inline-flex items-center gap-1 text-sm text-wine hover:underline">
            {t.pairAll} <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
