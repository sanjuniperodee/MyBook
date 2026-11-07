"use client";

import { DesignSwitch } from "../_design/DesignSwitch";
import { Link, useLocale, useMessages } from "@/i18n/client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Check, Columns3, ImagePlus, Layers, Sparkles, Square } from "lucide-react";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { backPreviewLayout, CoverBackPreview, PREVIEW_PAGES } from "@/components/cover/CoverBackPreview";
import { backCanvasSvg, spineSvg } from "@/components/cover/cover-sides";
import { FrameControls, FrameLayer, type FrameSlot } from "@/components/cover/FrameEditor";
import { DEFAULT_FRAME, frameKey, isDefaultFrame, type FrameMap, type PhotoFrame } from "@/lib/book/photo-frame";
import { backSlotBoxes, frontSlotBoxes } from "@/lib/book/photo-slots";
import { backPhotoRefs, coverPhotoRefs } from "@/lib/book/photo-refs";
import { BACK_PHOTO_SLOTS, layeredBack, type BackLayout } from "@/lib/book/cover-back";
import { BackSection } from "./BackSection";
import { InteriorSpread, type SpreadSample } from "@/components/interior/InteriorSpread";
import { SaveIndicator } from "@/components/SaveIndicator";
import { PanelBody, StudioFrame, StudioStage } from "@/components/design/studio/Frame";
import { GroupTitle, PillSwitch, StudioTabs, type StudioTab } from "@/components/design/studio/Tabs";
import { Book3D } from "@/components/cover/Book3D";
import { confirmDialog } from "@/components/ui/overlays";
import { useAutosave } from "@/hooks/useAutosave";
import { apiFetch } from "@/lib/client-api";
import { coverLabel, coverMoods, coverPhotoSlots, getCoverTemplate, pickerCovers, type CoverMood } from "@/lib/book/covers";
import { coverNames, NAMES_ON_COVER_MAX } from "@/lib/book/cover-names";
import { EmojiNote } from "./EmojiNote";
import { bookKind, RECORDED_BY_MAX } from "@/lib/content/kinds";
import { coverSpreadGeometry, getFormat } from "@/lib/book/formats";
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
import {
  backFill,
  backgroundMid,
  backLayersFromLayout,
  designFromTemplate,
  repeatedFrontLayers,
  templateForCover,
  type CoverBack,
  type CoverBackground,
  type CoverDesign,
  type CoverSide,
  type TextBind,
} from "@/lib/book/cover-design";
import { designColors } from "@/components/cover/designer/logic";
import { site } from "@/config/site";
import { BackFillSection, BackLayoutsPanel, SideSwitch, SpreadStrip } from "./CoverSides";
import { coverMeta } from "@/lib/book/covers/meta";
import { CoverDesigner } from "@/components/cover/designer/CoverDesigner";
import { CoverLayoutPicker } from "@/components/cover/CoverLayoutPicker";

/** Вкладки левой панели студии (на телефоне — вкладки листа): у лица одни, у оборота другие, «детали» — справа. */
type TplTab = "designs" | "photo" | "text" | "fill" | "variant" | "details";
/** Что на сцене: одна сторона, обложка целиком (оборот, корешок, лицо) или книга в объёме. */
type StageView = "flat" | "spread" | "3d";

/** Сколько обложек видно сразу во «Все» (выбранная показывается всегда). */
const DESIGNS_SHOWN = 12;

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
  /** Оборот: свой фон и слои из конструктора; null — как спереди и вариант оборота. */
  coverBack: CoverBack | null;
}

/** Образцы цвета оборота после цветов лица: тёмные, светлые и розовые — чтобы «в тон» находился сразу. */
const BACK_SWATCHES = ["#111111", "#1F1A17", "#FFFFFF", "#FBF7F1", "#E9DCCB", "#F4E4E1", "#E78496", "#D9466E", "#7A1F2B", "#2B1B2E", "#1F3A5F", "#1F3A36", "#7D8B6A", "#B8925A"];

/** Цвета шаблона (образец, надписи, украшение) — первыми в образцах цвета оборота у обложки шаблона. */
function templateColors(t: { swatch: string; title: { color: string }; names: { color: string }; ornament?: { color: string } }) {
  return [...new Set([...(t.swatch.match(/#[0-9a-fA-F]{6}/g) ?? []), t.title.color, t.names.color, ...(t.ornament ? [t.ornament.color] : [])].map((c) => c.toUpperCase()))];
}

/** Оборот без своего фона и слоёв не хранится: это и есть «как спереди» по умолчанию. */
const normalBack = (b: CoverBack | null): CoverBack | null => (!b || (b.background.kind === "template" && !b.layers) ? null : b);

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
  initialSide = "front",
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
  /** Сторона из адреса (?side=back) — ссылка ведёт сразу на оборот. */
  initialSide?: CoverSide;
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
  // Все 60+ обложек сразу — стена на телефоне: сначала дюжина (выбранная — всегда в ней), остальные по кнопке.
  const [allDesigns, setAllDesigns] = useState(false);
  const kind = bookKind(theme);
  const coverNamesLine = coverNames({ theme, ...state });
  const coverIds = [state.coverPhotoId, ...state.coverPhotoExtra].slice(0, slots);
  const coverPhotos = coverPhotoRefs(coverIds, photos, state, "view");
  const [side, setSideState] = useState<CoverSide>(initialSide);
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
  const backLayoutInfo = backPreviewLayout(state.coverTemplate, format, backContent, state.coverDesign, state.coverBack);
  const backLayered = !!state.coverBack?.layers;
  const backSlots: FrameSlot[] = backSlotBoxes(backLayoutInfo.design, backLayoutInfo.back.w, backLayoutInfo.back.h).flatMap((b) => {
    const p = backPhotos[b.slot];
    const key = frameKey("back", b.slot);
    return p ? [{ ...b, key, photo: { width: p.width, height: p.height }, frame: state.photoFrames[key] ?? DEFAULT_FRAME }] : [];
  });
  // Обложка из конструктора: кадр фото в местах шаблона правится в самом конструкторе — здесь только оборот.
  const frameSlots = side === "back" ? (backLayered ? [] : backSlots) : state.coverDesign ? [] : frontSlots;
  const frameSelected = frameSlots.some((s) => s.key === frameSel) ? frameSel : (frameSlots[0]?.key ?? null);

  /** Обложка или оборот (без управления кадром) — для большого превью и для мини-копии под шапкой. */
  const renderSide = (className: string, uid: string, lite = false) =>
    side === "back" ? (
      <CoverBackPreview
        template={state.coverTemplate}
        format={format}
        content={backContent}
        photos={backPhotoRefs(backPhotos, state, "view")}
        design={state.coverDesign}
        back={state.coverBack}
        texts={{ title: state.title || t.bookTitle, subtitle: state.subtitle, names: coverNamesLine }}
        uid={`bp${uid}`}
        lite={lite}
        className={className}
      />
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
  // ─── конструктор ──────────────────────────────────────────────────────────
  const d = m.design.cover;
  const tb = t.backDesigner;
  const [view, setView] = useState<"template" | "designer">(initial.coverDesign && initialSide === "front" ? "designer" : initial.coverBack?.layers && initialSide === "back" ? "designer" : "template");
  /** Новый ключ — конструктор начинается заново (после сброса или новой обложки из шаблона). */
  const [designerKey, setDesignerKey] = useState(0);
  const [backKey, setBackKey] = useState(0);
  const designTexts = { title: state.title, subtitle: state.subtitle, names: coverNamesLine };
  /** Правка привязанной надписи на обложке — это правка поля книги. */
  const setBookText = (bind: TextBind, value: string) => update(bind === "names" ? { namesOnCover: value } : bind === "title" ? { title: value.slice(0, 80) } : { subtitle: value.slice(0, 80) });

  // ─── оборот ───────────────────────────────────────────────────────────────
  const backBg: CoverBackground = state.coverBack?.background ?? { kind: "template" };
  const setBack = (next: CoverBack | null) => update({ coverBack: normalBack(next) });
  /** Цвета лица — первыми в образцах цвета оборота. */
  const frontColors = state.coverDesign ? designColors(state.coverDesign) : templateColors(template);
  const backColors = [...new Set([...frontColors, ...BACK_SWATCHES])].slice(0, 18);
  /** Чем залит оборот «как спереди»: фон лица из конструктора или образец шаблона. */
  const linkedFill = backFill(state.coverDesign, null);
  const likeFrontCss = linkedFill ? (linkedFill.bg.kind === "color" ? linkedFill.bg.color : `linear-gradient(90deg, ${linkedFill.bg.to}, ${linkedFill.bg.from})`) : template.swatch;
  const likeFrontBase = linkedFill ? backgroundMid(linkedFill.bg) : (/#[0-9a-fA-F]{6}/.exec(template.swatch)?.[0] ?? null);
  /**
   * Вариант оборота слоями — на тех же местах, что в превью и PDF. Варианту с фото без выбранных снимков — первые
   * свободные фото книги, как в «Шаблон и текст».
   */
  const backLayersFor = (layout: BackLayout) => {
    const need = BACK_PHOTO_SLOTS[layout] ?? 0;
    const ids = backPhotos.map((p) => p.id);
    for (const id of fillOrder) if (ids.length < need && !ids.includes(id)) ids.push(id);
    const list = ids.flatMap((id) => photos.filter((p) => p.id === id));
    const info = backPreviewLayout(state.coverTemplate, format, { ...backContent, layout, photos: list.map((p) => ({ width: p.width, height: p.height })) }, state.coverDesign, { v: 1, background: backBg });
    return backLayersFromLayout(info.design, info.back.w, info.back.h, { photoIds: ids, frames: ids.map((_, i) => state.photoFrames[frameKey("back", i)]), names: coverNamesLine });
  };

  /** Сторона: в конструкторе у неё должны быть слои — лицо собирается из шаблона, оборот — из своего варианта. */
  const ensureLayers = (s: CoverSide) => {
    if (!editable) return;
    if (s === "front" && !state.coverDesign) {
      update({ coverDesign: designFromTemplate(coverMeta(template), { title: state.title, subtitle: state.subtitle, names: coverNamesLine }, getFormat(format)) });
      setDesignerKey((k) => k + 1);
    }
    if (s === "back" && !state.coverBack?.layers) {
      setBack({ v: 1, background: backBg, layers: backLayersFor(state.backLayout) });
      setBackKey((k) => k + 1);
    }
  };
  const setSide = (s: CoverSide) => {
    setSideState(s);
    if (view === "designer") ensureLayers(s);
    // Ссылка на страницу ведёт на ту же сторону (?side=back), истории браузера не добавляем.
    const url = new URL(window.location.href);
    if (s === "back") url.searchParams.set("side", "back");
    else url.searchParams.delete("side");
    window.history.replaceState(window.history.state, "", url);
  };
  /** В конструктор — той стороной, что выбрана (или s). */
  const openDesigner = (s: CoverSide = side) => {
    if (s !== side) setSide(s);
    ensureLayers(s);
    if ((s === "front" && (state.coverDesign || editable)) || (s === "back" && (state.coverBack?.layers || editable))) setView("designer");
  };
  const resetDesign = async () => {
    if (!(await confirmDialog({ title: d.active.reset, text: d.active.confirmReset, danger: true }))) return;
    update({ coverDesign: null });
    setDesignerKey((k) => k + 1);
    setView("template");
  };
  const resetBack = async () => {
    if (!(await confirmDialog({ title: tb.reset, text: tb.confirmReset, danger: true }))) return;
    setBack({ v: 1, background: backBg });
    setBackKey((k) => k + 1);
    setView("template");
  };

  // ─── обложка целиком ──────────────────────────────────────────────────────
  const spread = coverSpreadGeometry(getFormat(format), PREVIEW_PAGES);
  const spineHtml = spineSvg(state.coverTemplate, format, state.coverDesign, state.coverBack, "sp", coverPhotos);
  const spreadStrip = (className: string, uid: string) => (
    <SpreadStrip
      side={side}
      onSelect={pickSide}
      className={className}
      widths={{ back: spread.back!.w, spine: spread.spine!.w, front: spread.front.w, height: spread.front.h }}
      back={
        <CoverBackPreview
          template={state.coverTemplate}
          format={format}
          content={backContent}
          photos={backPhotoRefs(backPhotos, state, "view")}
          design={state.coverDesign}
          back={state.coverBack}
          texts={{ title: state.title || t.bookTitle, subtitle: state.subtitle, names: coverNamesLine }}
          uid={`s${uid}`}
          lite
        />
      }
      spine={<div className="[&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: spineHtml }} />}
      front={<CoverPreview template={state.coverTemplate} format={format} title={state.title} subtitle={state.subtitle} names={coverNamesLine} photos={coverPhotos} uid={`s${uid}f`} lite titlePlaceholder={t.bookTitle} design={state.coverDesign} />}
    />
  );
  const backTemplate = templateForCover(template, state.coverDesign, state.coverBack);
  const backBoard = spread.back!;

  // ─── студия: панели ───────────────────────────────────────────────────────
  const sx = m.design.ui.studio.cover;
  const [stageView, setStageView] = useState<StageView>("flat");
  const [tplTab, setTplTab] = useState<TplTab>("designs");
  /** Объём у оборота не показываем: вернулись к лицу — снова объём. */
  const stageMode: StageView = stageView === "3d" && side === "back" ? "flat" : stageView;
  const pickSide = (s: CoverSide) => {
    setSide(s);
    setStageView((v) => (v === "spread" ? "flat" : v));
  };

  /** Выбор дизайна обложки: настроение, миниатюры с фото книги, выбранный — всегда в списке. */
  const designsPanel = (
    <div>
      <h2 className="sr-only">{t.design}</h2>
      <div className="text-xs text-muted tabular-nums">{m.common.count.variants(choices.length)}</div>
      <div className="no-scrollbar -mx-1 mt-2.5 flex gap-1.5 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label={t.moodAria}>
        {(["all", ...coverMoods] as const).map((id) => (
          <button key={id} type="button" role="radio" aria-checked={mood === id} onClick={() => setMood(id)} className={cn("chip min-h-11 shrink-0 pointer-fine:min-h-8", mood === id && "chip-on")}>
            {m.catalog.moods[id]}
          </button>
        ))}
      </div>
      <div ref={strip} className="mt-3 grid grid-cols-3 gap-x-2.5 gap-y-3.5">
        {choices
          .filter((c) => mood === "all" || c.mood === mood || c.id === state.coverTemplate)
          .filter((c, i) => mood !== "all" || allDesigns || i < DESIGNS_SHOWN || c.id === state.coverTemplate)
          .map((c) => (
            <button key={c.id} onClick={() => chooseTemplate(c.id)} disabled={!editable} className="group text-left" aria-pressed={c.id === state.coverTemplate}>
              <div className={cn("relative overflow-hidden rounded-[3px] ring-offset-2 ring-offset-white transition", c.id === state.coverTemplate ? "ring-2 ring-wine" : "ring-1 ring-line group-hover:ring-ink/30")}>
                <CoverPreview template={c.id} format={format} title={state.title} names={coverNamesLine} photos={c.requiresPhoto ? slotUrls(c.id) : undefined} lite uid={`pick-${c.id}`} />
                {c.requiresPhoto && !photos.length ? (
                  <span className="absolute bottom-1 left-1 flex size-5 items-center justify-center rounded-full bg-black/45 text-white" aria-hidden>
                    <ImagePlus className="size-3" />
                  </span>
                ) : null}
                {c.id === state.coverTemplate ? (
                  <span className="absolute top-1 right-1 flex size-4.5 items-center justify-center rounded-full bg-wine text-white">
                    <Check className="size-3" />
                  </span>
                ) : null}
              </div>
              <div className={cn("mt-1.5 truncate text-xs", c.id === state.coverTemplate ? "font-medium text-ink" : "text-muted")}>{label(c)}</div>
            </button>
          ))}
      </div>
      {mood === "all" && !allDesigns && choices.length > DESIGNS_SHOWN ? (
        <button type="button" className="btn btn-outline mt-4 w-full" onClick={() => setAllDesigns(true)}>
          {t.showAllDesigns(choices.length)}
        </button>
      ) : null}
    </div>
  );

  const photoPanel = template.requiresPhoto ? (
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
  ) : null;

  const textPanel = (
    <div className="space-y-4">
      <Field label={t.bookTitle} value={state.title} max={80} onChange={(v) => update({ title: v })} disabled={!editable} />
      <Field label={t.subtitle} placeholder={t.subtitlePlaceholder} value={state.subtitle} max={80} onChange={(v) => update({ subtitle: v })} disabled={!editable} />
      <Field label={kind === "autobiography" ? t.narratorName : t.authorName} value={state.authorName} max={60} onChange={(v) => update({ authorName: v })} disabled={!editable} />
      {kind === "autobiography" ? <Field label={t.recordedBy} placeholder={t.recordedByPlaceholder} value={state.recordedBy} max={RECORDED_BY_MAX} onChange={(v) => update({ recordedBy: v })} disabled={!editable} /> : null}
      {/* Получатель: у подарка — обязательное поле, у своей книги — «необязательно», у автобиографии его нет (посвящение — во вкладке «Страницы»). */}
      {kind !== "autobiography" ? (
        <div>
          <Field label={recipientLabel} value={state.recipientName} max={60} onChange={(v) => update({ recipientName: v })} disabled={!editable} />
          <label className="mt-2.5 flex min-h-11 items-center gap-2.5 text-sm text-ink-soft pointer-fine:min-h-0">
            <input type="checkbox" className="size-4 accent-wine" checked={state.hideRecipientOnCover} onChange={(e) => update({ hideRecipientOnCover: e.target.checked })} disabled={!editable} />
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
    </div>
  );

  const fillPanel = (
    <BackFillSection
      background={backBg}
      likeFront={likeFrontCss}
      colors={backColors}
      editable={editable}
      onChange={(background) => setBack({ v: 1, ...state.coverBack, background })}
      onMore={editable || backLayered ? () => openDesigner("back") : undefined}
    />
  );

  const variantPanel = backLayered ? (
    <p className="text-sm text-ink-soft">{tb.active}</p>
  ) : (
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
      onFocusBack={() => undefined}
    />
  );

  /** Конструктор: приглашение (или «обложка собрана в конструкторе» со сбросом) — для той стороны, что открыта. */
  const designerCard = (s: CoverSide) => {
    const layered = s === "front" ? !!state.coverDesign : backLayered;
    const copy = s === "front" ? { title: d.cta.title, text: d.cta.text, open: d.cta.open, active: d.active.text, openActive: d.active.open, reset: d.active.reset } : { title: tb.title, text: tb.text, open: tb.open, active: tb.active, openActive: tb.openActive, reset: tb.reset };
    if (layered)
      return (
        <div className="space-y-3 rounded-[var(--r-panel)] bg-rose/50 p-3.5">
          <p className="flex gap-2 text-sm text-ink-soft">
            <Layers className="mt-0.5 size-4 shrink-0 text-wine" aria-hidden /> {copy.active}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => openDesigner(s)}>
              {copy.openActive}
            </button>
            {editable ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={s === "front" ? resetDesign : resetBack}>
                {copy.reset}
              </button>
            ) : null}
          </div>
        </div>
      );
    if (!editable) return null;
    return (
      <div className="space-y-2.5 rounded-[var(--r-panel)] border border-line bg-white p-3.5">
        <div className="flex items-start gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--r-ctl)] bg-rose text-wine">
            <Layers className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold">{copy.title}</div>
            <p className="mt-0.5 text-[13px] leading-snug text-muted">{copy.text}</p>
          </div>
        </div>
        <button type="button" className="btn btn-dark btn-sm w-full" onClick={() => openDesigner(s)}>
          {copy.open}
        </button>
      </div>
    );
  };

  /** «Детали»: что выбрано, кадр фото на обложке, конструктор и страницы в пару. */
  const detailsPanel = (
    <div className="space-y-5">
      <div>
        <GroupTitle>{sx.chosen}</GroupTitle>
        <div className="font-serif text-xl leading-tight font-medium">{label(template)}</div>
        <div className="mt-0.5 text-xs text-muted">{m.catalog.moods[template.mood as CoverMood] ?? ""}</div>
      </div>
      {editable && frameSlots.length ? (
        <div>
          <GroupTitle>{sx.frameTitle}</GroupTitle>
          <FrameControls slots={frameSlots} selected={frameSelected} onSelect={setFrameSel} onChange={setFrame} labels={{ ...t.frame, hintTouch: m.books.coverPhotos.frameHintTouch }} />
        </div>
      ) : null}
      {designerCard(side)}
      {side === "front" ? <PairedPages bookId={bookId} cover={state.coverTemplate} interior={state.interior} format={format} sample={sample} editable={editable} onApply={(interior) => update({ interior })} /> : null}
    </div>
  );

  const leftTabs: StudioTab<TplTab>[] =
    side === "back"
      ? [
          { id: "fill", label: sx.tabs.fill },
          { id: "variant", label: sx.tabs.variant },
        ]
      : [{ id: "designs", label: sx.tabs.designs }, ...(template.requiresPhoto ? [{ id: "photo" as const, label: sx.tabs.photo }] : []), { id: "text", label: sx.tabs.text }];
  const sheetTabs: StudioTab<TplTab>[] = [...leftTabs, { id: "details", label: sx.tabs.details }];
  const leftTab = leftTabs.some((x) => x.id === tplTab) ? tplTab : leftTabs[0].id;
  const sheetTab = sheetTabs.some((x) => x.id === tplTab) ? tplTab : leftTabs[0].id;
  const tabPanel = (id: TplTab) => (id === "designs" ? designsPanel : id === "photo" ? photoPanel : id === "text" ? textPanel : id === "fill" ? fillPanel : id === "variant" ? variantPanel : detailsPanel);

  // ─── студия: сцена ────────────────────────────────────────────────────────
  const frontRatio = spread.front.w / spread.front.h;
  const spreadRatio = (spread.back!.w + spread.spine!.w + spread.front.w) / spread.front.h;
  /** Ширина листа на сцене: помещается и по ширине, и по высоте (поля под переключатели сверху и подпись снизу). */
  const fit = (ratio: number, extra = 0) => ({ width: `min(calc(100cqw - 2rem), calc((100cqh - ${5.5 + extra}rem) * ${ratio}))` });
  const sideSwitch = <SideSwitch side={side} onChange={pickSide} />;
  const viewSwitch = (
    <PillSwitch
      label={sx.view.aria}
      size="sm"
      value={stageMode}
      onChange={setStageView}
      options={[
        { value: "flat", label: sx.view.flat, icon: <Square className="size-3.5" aria-hidden />, iconOnly: true },
        { value: "spread", label: sx.view.spread, icon: <Columns3 className="size-3.5" aria-hidden />, iconOnly: true },
        { value: "3d", label: sx.view.spatial, icon: <Box className="size-3.5" aria-hidden />, iconOnly: true, disabled: side === "back", title: side === "back" ? sx.view.spatialBack : undefined },
      ]}
    />
  );
  /** Холст сцены: выбранный вид обложки — плоско (с кадром фото), целиком или в объёме. */
  const stageArt =
    stageMode === "spread" ? (
      <div className="absolute inset-0 flex items-center justify-center px-4 pt-14 pb-3">
        <div style={fit(spreadRatio, 1.5)}>
          {spreadStrip("", "st")}
          <p className="mt-1 text-center text-xs text-muted">{sx.spreadHint}</p>
        </div>
      </div>
    ) : stageMode === "3d" ? (
      <div className="absolute inset-0 flex items-center justify-center px-4 pt-14 pb-5">
        <div style={fit(frontRatio * 1.12)}>
          <Book3D template={state.coverTemplate} format={format} title={state.title} subtitle={state.subtitle} names={coverNamesLine} photos={coverPhotos} uid="b3d" lite titlePlaceholder={t.bookTitle} design={state.coverDesign} rotate={-24} />
        </div>
      </div>
    ) : (
      <div className="absolute inset-0 flex items-center justify-center px-4 pt-14 pb-5">
        <div className="relative" style={fit(side === "back" ? backBoard.w / backBoard.h : frontRatio)}>
          {renderSide("rounded-[4px] shadow-book", "editor")}
          {editable && frameSlots.length ? <FrameLayer slots={frameSlots} selected={frameSelected} onSelect={setFrameSel} onChange={setFrame} ariaLabel={t.frame.aria} /> : null}
        </div>
      </div>
    );
  const stageOverlay = (
    <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2 [&>*]:pointer-events-auto">
      <span className="lg:hidden">{sideSwitch}</span>
      <span className="ml-auto">{viewSwitch}</span>
    </div>
  );
  const stageName = (
    <div className="hidden items-center justify-center gap-2 text-sm text-muted lg:flex">
      <span className="font-medium text-ink">{label(template)}</span>
    </div>
  );

  const designerOn = view === "designer" && (side === "front" ? !!state.coverDesign : backLayered);
  const resetLink =
    designerOn && editable ? (
      <button type="button" className="btn btn-ghost btn-sm" onClick={side === "front" ? resetDesign : resetBack}>
        {side === "front" ? d.active.reset : tb.reset}
      </button>
    ) : null;
  const bar = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <DesignSwitch bookId={bookId} />
      <PillSwitch
        label={d.tabs.aria}
        value={view}
        onChange={(v) => (v === "designer" ? openDesigner() : setView("template"))}
        options={[
          { value: "template", label: d.tabs.template },
          { value: "designer", label: d.tabs.designer, icon: <Layers className="size-3.5" aria-hidden />, disabled: !editable && !(side === "front" ? !!state.coverDesign : backLayered) },
        ]}
      />
      <span className="max-lg:hidden">{sideSwitch}</span>
      <div className="ml-auto flex items-center gap-2">
        <span className="max-lg:hidden">{resetLink}</span>
        <SaveIndicator status={status} error={error} />
      </div>
    </div>
  );

  const templateView = (
    <StudioFrame
      bar={bar}
      leftWidth={320}
      rightWidth={320}
      left={<PanelBody tabs={<StudioTabs tabs={leftTabs} value={leftTab} onChange={setTplTab} label={sx.panelsAria} />}>{tabPanel(leftTab)}</PanelBody>}
      right={
        <PanelBody tabs={<StudioTabs tabs={[{ id: "details", label: sx.tabs.details }]} value="details" onChange={() => undefined} label={sx.panelsAria} />}>{detailsPanel}</PanelBody>
      }
      stage={
        <StudioStage overlay={stageOverlay} foot={stageName}>
          {stageArt}
        </StudioStage>
      }
      mobileTabs={<StudioTabs tabs={sheetTabs} value={sheetTab} onChange={setTplTab} label={sx.panelsAria} />}
      sheet={tabPanel(sheetTab)}
    />
  );

  const frontLayers = !!state.coverDesign;
  /** Сцена-замена в конструкторе: «целиком» и «объём» показываем вместо холста, не теряя историю правок. */
  const stageSwap = stageMode === "flat" ? null : stageArt;
  return (
    <div>
      {view === "designer" ? (
        <>
          {frontLayers ? (
            <div hidden={side !== "front"}>
              <CoverDesigner
                key={designerKey}
                bar={bar}
                stageSwap={stageSwap}
                stageOverlay={stageOverlay}
                bookId={bookId}
                template={state.coverTemplate}
                format={format}
                initial={state.coverDesign!}
                texts={designTexts}
                templatePhotos={coverPhotos}
                bookPhotos={photos}
                editable={editable}
                active={side === "front"}
                onChange={(coverDesign) => update({ coverDesign })}
                onBookText={setBookText}
                onTemplate={(coverTemplate) => update({ coverTemplate })}
                layouts={(onPick) => <CoverLayoutPicker format={format} texts={designTexts} photos={photos} currentTemplate={state.coverTemplate} onPick={onPick} />}
              />
            </div>
          ) : null}
          {state.coverBack?.layers ? (
            <div hidden={side !== "back"}>
              <CoverDesigner
                key={`back${backKey}`}
                bar={bar}
                stageSwap={stageSwap}
                stageOverlay={stageOverlay}
                bookId={bookId}
                template={state.coverTemplate}
                format={format}
                initial={{ v: 1, background: backBg, layers: state.coverBack.layers }}
                texts={designTexts}
                bookPhotos={photos}
                editable={editable}
                side="back"
                active={side === "back"}
                backdrop={backCanvasSvg(state.coverTemplate, format, state.coverDesign, state.coverBack, 8, "bkc")}
                underlay={repeatedFrontLayers(state.coverDesign, state.coverBack)}
                baseColor={likeFrontBase}
                colors={frontColors}
                brand={{ design: layeredBack(backTemplate, backBoard.h), name: site.name }}
                onChange={(back) => setBack({ v: 1, background: back.background, layers: back.layers })}
                onBookText={setBookText}
                layouts={(onPick) => <BackLayoutsPanel disabled={!editable} onPick={(layout) => onPick({ v: 1, background: backBg, layers: backLayersFor(layout) })} />}
              />
            </div>
          ) : null}
          {!designerOn ? (
            // Книга заказана, а слоёв у этой стороны нет: показываем как есть.
            <div className="space-y-3">
              {bar}
              <div className="mx-auto max-w-[340px] space-y-3 text-center">
                <p className="rounded-[var(--r-panel)] bg-cream px-4 py-3 text-sm text-ink-soft">{side === "back" ? tb.readonly : d.readonly}</p>
                {renderSide("rounded-[4px] shadow-book", "ro")}
              </div>
            </div>
          ) : null}
        </>
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
      <h2 className="mb-2 text-[13px] font-semibold">{slots > 1 ? t.photos(slots) : t.photo}</h2>
      {slots > 1 ? (
        <div className="mb-3 flex flex-wrap gap-2" role="radiogroup" aria-label={t.photoSlotsAria}>
          {ids.map((id, i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={current === i}
              onClick={() => setActive(i)}
              className={cn("relative size-14 overflow-hidden rounded-[var(--r-ctl)] ring-offset-2 transition", current === i ? "ring-2 ring-wine" : "ring-1 ring-line hover:ring-ink/30")}
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
          <ul className="grid grid-cols-3 gap-x-2 gap-y-3">
            {photos.map((p) => {
              const slot = ids.indexOf(p.id);
              return (
                <li key={p.id} className="min-w-0">
                  <button
                    type="button"
                    disabled={!editable}
                    onClick={() => pick(p.id)}
                    aria-pressed={slot >= 0}
                    className={cn("relative block aspect-square w-full overflow-hidden rounded-[var(--r-ctl)] ring-offset-2", slot >= 0 ? "ring-2 ring-wine" : "ring-1 ring-line")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoUrl(p.id)} alt="" className="h-full w-full object-cover" />
                    {slot >= 0 ? (
                      <span className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-wine text-[11px] font-medium text-white">
                        {slots > 1 ? slot + 1 : <Check className="size-3" />}
                      </span>
                    ) : null}
                    {p.width < 1800 ? <span className="absolute inset-x-0 bottom-0 bg-warning py-0.5 text-[10px] text-white">{t.lowQuality}</span> : null}
                  </button>
                  <PlaceBadge place={place(p.id)} names={names} blank={blank} marked={p.opener} openerDesign={openerDesign} className="mt-1 text-[11px]" />
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-muted">{m.books.coverPhotos.note}</p>
        </>
      ) : null}
      <Link href={`/books/${bookId}/photos`} className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm text-wine hover:underline pointer-fine:min-h-0">
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
      <EmojiNote text={value} />
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
      <EmojiNote text={value} />
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
    <section className="space-y-3">
      <GroupTitle>
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-wine" aria-hidden /> {t.pairTitle}
        </span>
      </GroupTitle>
      <InteriorSpread design={shown} format={getFormat(format)} sample={sample} className="w-full rounded-[3px] ring-1 ring-line" />
      <p className="text-[13px] leading-snug text-ink-soft">{matched ? t.pairDone(names[current.id].name, coverTitle) : t.pairSuggest(coverTitle, pairs.map((d) => names[d.id].name))}</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {!matched && editable ? (
          <button type="button" className="btn btn-dark btn-sm" onClick={() => onApply(shown.id)}>
            {t.pairApply(names[shown.id].name)}
          </button>
        ) : null}
        <Link href={`/books/${bookId}/pages`} className="inline-flex min-h-11 items-center gap-1 text-sm text-wine hover:underline pointer-fine:min-h-0">
          {t.pairAll}
        </Link>
      </div>
    </section>
  );
}
