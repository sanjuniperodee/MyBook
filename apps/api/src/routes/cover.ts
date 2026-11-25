/**
 * Обложка в API v1: настройки книги и конструктор обложки (лицо, оборот, кадры фото, слои, макеты, шрифты, палитры,
 * фигуры/декоративные линии, декор, сток и все надписи интерфейса) через тот же сервис и доменные функции, что у сайта.
 */
import type { z } from "zod";
import { COVER_DESIGN_LIMITS, COVER_TEXT_MAX, type Cover, type CoverDesignerCatalog, type CoverLayer, type CoverTemplate } from "@mybook/contracts";
import { coverName } from "@/i18n/labels";
import { isLocale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import { coverMoods, coverPhotoIds, coverPhotoSlots, getCoverTemplate, PICKER_SHOWN, pickerCovers, type CoverTemplate as Template } from "@/lib/book/covers";
import { coverMeta } from "@/lib/book/covers/meta";
import { BACK_PHOTO_SLOTS, backContent, backLayouts, designBack, type BackLayout } from "@/lib/book/cover-back";
import {
  backLayersFromLayout,
  boardSize,
  COVER_LIMITS,
  coverLayouts,
  DECOR_IDS,
  decorDrawing,
  designFromTemplate,
  parseCoverBack,
  parseCoverDesign,
  repeatedFrontLayers,
  safeArea,
  shapeElements,
  stockGroups,
  stockPhotos,
  templateForCover,
  type CoverBack,
  type CoverBackground,
  type CoverDesign,
  type CoverLayer as DomainCoverLayer,
  type DecorId,
  type ShapeKind,
} from "@/lib/book/cover-design";
import { coverNames } from "@/lib/book/cover-names";
import { fontCategories, fontFaces, fontKeys, fontWeights } from "@/lib/book/fonts";
import { coverSpreadGeometry, getFormat } from "@/lib/book/formats";
import type { Drawing, Shape } from "@/lib/book/interior-art";
import { coverPhotoUrl } from "@/lib/book/photo-cover";
import { frameKey, MAX_ZOOM, parseFrames, type FrameMap } from "@/lib/book/photo-frame";
import { bookKind } from "@/lib/content/kinds";
import { getTheme } from "@/lib/content/themes";
import { coverArtUrl } from "@/lib/urls";
import { isBookEditableBy, type BookRow, type BookViewer } from "@/modules/authoring";
import { apiBook, HttpError } from "@/server/api";
import { container } from "@/server/container";
import { coverBackImagePath, coverBackVersion, coverImageVersion } from "@/server/cover-image";
import type { Handlers } from "../app";

/** Типичная толщина книги для расчёта развёртки оборота (как PREVIEW_PAGES в CoverBackPreview.tsx). */
const PREVIEW_PAGES = 120;

/** Базовые палитры цветов — те же, что в PropertiesPanel.tsx и CoverEditor.tsx. */
const COVER_SWATCHES = ["#1F1A17", "#FFFFFF", "#FBF7F1", "#7A1F2B", "#B8925A", "#F3D9A4", "#2B1B2E", "#1F3A5F", "#7D8B6A", "#D9466E"];
const BACK_SWATCHES = ["#111111", "#1F1A17", "#FFFFFF", "#FBF7F1", "#E9DCCB", "#F4E4E1", "#E78496", "#D9466E", "#7A1F2B", "#2B1B2E", "#1F3A5F", "#1F3A36", "#7D8B6A", "#B8925A"];

const SHAPE_KINDS: ShapeKind[] = ["rect", "ellipse", "line", "frame", "double", "corners", "arch"];
const OUTLINE_ONLY_SHAPES = new Set<ShapeKind>(["line", "frame", "double", "corners"]);
const RADIUS_SHAPES = new Set<ShapeKind>(["rect", "frame", "double"]);

const TEXT_PRESETS = [
  { id: "heading" as const, font: "prata", weight: 400, size: 0.085, lineHeight: 1.1, h: 0.14 },
  { id: "subheading" as const, font: "cormorantsc", weight: 600, size: 0.038, lineHeight: 1.2, tracking: 0.18, upper: true, h: 0.06 },
  { id: "body" as const, font: "lora", weight: 400, size: 0.032, lineHeight: 1.35, h: 0.1 },
  { id: "script" as const, font: "caveat", weight: 500, size: 0.07, lineHeight: 1.1, h: 0.1 },
];

/** Перевод фигур interior-art (Shape[]) в чистый SVG-фрагмент для значков и мотивов в приложении. */
function shapeToSvgTag(s: Shape): string {
  const op = (attr: string) => (s.opacity !== undefined ? ` ${attr}="${s.opacity}"` : "");
  switch (s.kind) {
    case "circle":
      return `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="${s.fill}"${op("fill-opacity")}/>`;
    case "rect": {
      const fill = s.fill ?? "none";
      const stroke = s.stroke ? ` stroke="${s.stroke}" stroke-width="${s.width ?? 1}"${op("stroke-opacity")}` : "";
      return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${fill}"${s.fill ? op("fill-opacity") : ""}${stroke}/>`;
    }
    case "path": {
      const fill = s.fill ?? "none";
      const stroke = s.stroke ? ` stroke="${s.stroke}" stroke-width="${s.width ?? 1}"${op("stroke-opacity")}` : "";
      const cap = s.round ? ` stroke-linecap="round" stroke-linejoin="round"` : "";
      const tr = s.transform ? ` transform="${s.transform}"` : "";
      return `<path d="${s.d}" fill="${fill}"${s.fill ? op("fill-opacity") : ""}${stroke}${cap}${tr}/>`;
    }
  }
}

function drawingToSvg(d: Drawing): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.w} ${d.h}">${d.shapes.map(shapeToSvgTag).join("")}</svg>`;
}

function shapeIconSvg(shape: ShapeKind): string {
  const shapes = shapeElements({ id: "i", kind: "shape", shape, x: 0, y: 0, w: 1, h: 1, fill: "#B8925A", stroke: "#3B332E", strokeWidth: 0.07 }, 26, 26, 26);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g transform="translate(3,3)">${shapes.map(shapeToSvgTag).join("")}</g></svg>`;
}

function decorOptionSvg(id: DecorId): { aspect: number; svg: string } {
  const d = decorDrawing(id, "#3B332E");
  return { aspect: Math.round((d.w / Math.max(d.h, 1)) * 1000) / 1000, svg: drawingToSvg(d) };
}

/** Цвета, которые уже есть в обложке конструктора — первыми в палитре выбора цвета (как designColors в logic.ts). */
function designColors(d: CoverDesign): string[] {
  const out: string[] = [];
  const add = (c?: string | null) => {
    if (c && !out.includes(c.toUpperCase())) out.push(c.toUpperCase());
  };
  if (d.background.kind === "color") add(d.background.color);
  if (d.background.kind === "gradient") {
    add(d.background.from);
    add(d.background.to);
  }
  for (const l of d.layers) {
    if (l.kind === "text") {
      add(l.style.color);
      add(l.style.plate?.color);
      add(l.style.outline?.color);
    } else if (l.kind === "shape") {
      add(l.fill);
      add(l.stroke);
      add(l.gradient?.to);
    } else if (l.kind === "decor") {
      add(l.color);
    } else {
      add(l.border?.color);
    }
  }
  return out.slice(0, 10);
}

function templateColors(t: Template): string[] {
  return [
    ...new Set(
      [...(t.swatch.match(/#[0-9a-fA-F]{6}/g) ?? []), t.title.color, t.names.color, ...(t.ornament ? [t.ornament.color] : [])].map((c) => c.toUpperCase()),
    ),
  ];
}

/** Оборот без своего фона и слоёв не хранится — как normalBack в CoverEditor.tsx. */
const normalBack = (b: CoverBack | null): CoverBack | null => (!b || (b.background.kind === "template" && !b.layers) ? null : b);

/** Приведение доменного слоя к DTO контракта (art — произвольный объект для сохранения без потерь). */
const toLayerDto = (l: DomainCoverLayer): z.output<typeof CoverLayer> => l as unknown as z.output<typeof CoverLayer>;

const toDesignDto = (d: CoverDesign | null) => (d ? { v: d.v, background: d.background, layers: d.layers.map(toLayerDto) } : null);
const toBackDto = (b: CoverBack | null) => (b ? { v: b.v, background: b.background, ...(b.layers ? { layers: b.layers.map(toLayerDto) } : {}) } : null);

const toTemplate = (t: Template, format: string, locale: "ru" | "kk"): z.output<typeof CoverTemplate> => ({
  id: t.id,
  name: coverName(t.id, locale),
  mood: t.mood,
  requiresPhoto: !!t.requiresPhoto,
  photoSlots: coverPhotoSlots(t),
  previewUrl: coverArtUrl(t, format, true),
});

const toCover = (b: BookRow, viewer: BookViewer): z.output<typeof Cover> => {
  const fmt = getFormat(b.format);
  const tpl = getCoverTemplate(b.coverTemplate, b.coverLines);
  const slots = coverPhotoSlots(tpl);
  const frontDesign = parseCoverDesign(b.coverDesign);
  const backDesign = parseCoverBack(b.coverBack);
  const frames = parseFrames(b.photoFrames);
  const backPhotoIds = [b.backPhotoId, ...(b.backPhotoExtra ?? [])].filter((id): id is string => !!id);
  const imgVer = coverImageVersion(b);
  const backVer = coverBackVersion(b);
  return {
    template: b.coverTemplate,
    lines: b.coverLines,
    title: b.title,
    subtitle: b.subtitle,
    namesOnCover: b.namesOnCover,
    hideRecipientOnCover: b.hideRecipientOnCover,
    authorName: b.authorName,
    recordedBy: b.recordedBy,
    recipientName: b.recipientName,
    kind: bookKind(b.theme),
    recipientLabel: getTheme(b.theme, isLocale(b.language) ? b.language : "ru").recipientLabel ?? null,
    autoNames: coverNames({ ...b, namesOnCover: "" }),
    year: backContent(b, [], new Date()).year ?? new Date().getFullYear(),
    photoIds: coverPhotoIds(b),
    backText: b.backText,
    backLayout: b.backLayout,
    backPhotoId: b.backPhotoId,
    backPhotoIds,
    hasDesign: frontDesign !== null,
    hasBackDesign: !!backDesign?.layers,
    coverDesign: toDesignDto(frontDesign),
    coverBack: toBackDto(backDesign),
    backUnderlay: repeatedFrontLayers(frontDesign, backDesign).map(toLayerDto),
    photoFrames: Object.entries(frames).map(([key, frame]) => ({ key, frame })),
    format: b.format,
    board: boardSize(fmt),
    safeFront: safeArea(fmt, "front"),
    safeBack: safeArea(fmt, "back"),
    imageUrl: `/api/books/${b.id}/cover-image?v=${imgVer}`,
    backImageUrl: coverBackImagePath(b),
    spreadImageUrl: `/api/books/${b.id}/cover-image?side=spread&p=${PREVIEW_PAGES}&v=${backVer}`,
    templateBgUrl: slots > 0 ? `/api/books/${b.id}/cover-thumb/${b.coverTemplate}?v=${imgVer}` : coverArtUrl(tpl, b.format, false),
    backTemplateBgUrl: coverArtUrl(tpl, b.format, false, "back"),
    templateBaseColor: /#[0-9a-fA-F]{6}/.exec(tpl.swatch)?.[0]?.toUpperCase() ?? null,
    editable: b.status === "draft" && isBookEditableBy(b.userId, viewer),
  };
};

function designerCatalog(book: BookRow, locale: "ru" | "kk"): z.output<typeof CoverDesignerCatalog> {
  const m = messagesFor(locale);
  const t = m.books.cover;
  const d = m.design.cover;
  const dl = m.design.layouts;
  const du = m.design.ui;
  const sx = du.studio.cover;
  const tpl = getCoverTemplate(book.coverTemplate, book.coverLines);
  const frontDesign = parseCoverDesign(book.coverDesign);
  const frontColors = frontDesign ? designColors(frontDesign) : templateColors(tpl);
  const swatches = [...new Set([...frontColors, ...COVER_SWATCHES])].slice(0, 16);
  const backSwatches = [...new Set([...frontColors, ...BACK_SWATCHES])].slice(0, 18);
  const layoutGenresList = [...new Set(coverLayouts.map((l) => l.genre))];

  return {
    swatches,
    backSwatches,
    fonts: fontKeys.map((id) => {
      const f = fontFaces[id];
      const fw = fontWeights(id);
      return { id, name: f.name ?? f.family, category: f.category ?? "book", weights: fw.weights, italic: fw.italic, body: !!f.body };
    }),
    fontCategories: [{ id: "all", label: du.fonts.all }, ...fontCategories.map((id) => ({ id, label: du.fonts.categories[id] }))],
    weightLabels: Object.entries(du.weights).map(([w, label]) => ({ weight: Number(w), label })),
    shapes: SHAPE_KINDS.map((id) => ({
      id,
      label: d.add.shapeNames[id],
      outlineOnly: OUTLINE_ONLY_SHAPES.has(id),
      supportsRadius: RADIUS_SHAPES.has(id),
      svg: shapeIconSvg(id),
    })),
    decors: DECOR_IDS.map((id) => {
      const { aspect, svg } = decorOptionSvg(id);
      return { id, label: d.add.decorNames[id], aspect, svg };
    }),
    textPresets: TEXT_PRESETS.map((p) => ({
      id: p.id,
      label: d.add.presets[p.id],
      sampleText: d.add.newText[p.id],
      font: p.font,
      weight: p.weight,
      size: p.size,
      lineHeight: p.lineHeight,
      ...(p.tracking !== undefined ? { tracking: p.tracking } : {}),
      ...(p.upper !== undefined ? { upper: p.upper } : {}),
      h: p.h,
    })),
    imageMasks: (["rect", "rounded", "circle", "arch"] as const).map((id) => ({ id, label: d.props.image.masks[id] })),
    aligns: (["left", "center", "right"] as const).map((id) => ({ id, label: d.props.text.aligns[id] })),
    valigns: (["top", "middle", "bottom"] as const).map((id) => ({ id, label: d.props.text.valigns[id] })),
    bgKinds: (["template", "color", "gradient"] as const).map((id) => ({ id, label: d.props.background.kinds[id] })),
    stockGroups: stockGroups.map((id) => ({ id, label: d.add.stockGroups[id] })),
    stockPhotos: Object.entries(stockPhotos).map(([id, group]) => ({
      id,
      group,
      thumbUrl: coverPhotoUrl(id, 480),
      viewUrl: coverPhotoUrl(id, 900),
    })),
    layoutGenres: [{ id: "all", label: dl.all }, ...layoutGenresList.map((id) => ({ id, label: dl.genres[id] }))],
    layouts: coverLayouts.map((l) => {
      const item = dl.items[l.id] ?? { name: l.id, description: "" };
      return { id: l.id, genre: l.genre, name: item.name, description: item.description, template: l.template ?? null };
    }),
    limits: {
      layers: COVER_LIMITS.layers,
      text: COVER_LIMITS.text,
      name: COVER_LIMITS.name,
      bleed: COVER_LIMITS.bleed,
      minSize: COVER_LIMITS.minSize,
      maxSize: COVER_LIMITS.maxSize,
      fontSizeMin: COVER_LIMITS.fontSize[0],
      fontSizeMax: COVER_LIMITS.fontSize[1],
      trackingMin: COVER_LIMITS.tracking[0],
      trackingMax: COVER_LIMITS.tracking[1],
      lineHeightMin: COVER_LIMITS.lineHeight[0],
      lineHeightMax: COVER_LIMITS.lineHeight[1],
      shadowMin: COVER_LIMITS.shadow[0],
      shadowMax: COVER_LIMITS.shadow[1],
      outlineMin: COVER_LIMITS.outline[0],
      outlineMax: COVER_LIMITS.outline[1],
      strokeMin: COVER_LIMITS.stroke[0],
      strokeMax: COVER_LIMITS.stroke[1],
      borderMin: COVER_LIMITS.border[0],
      borderMax: COVER_LIMITS.border[1],
      frameZoomMin: COVER_DESIGN_LIMITS.frameZoomMin,
      frameZoomMax: MAX_ZOOM,
      minDpi: COVER_DESIGN_LIMITS.minDpi,
      ptPerMm: COVER_DESIGN_LIMITS.ptPerMm,
      historyLimit: COVER_DESIGN_LIMITS.historyLimit,
    },
    labels: {
      modes: { template: d.tabs.template, designer: d.tabs.designer },
      views: { flat: sx.view.flat, spread: sx.view.spread, spreadHint: sx.spreadHint },
      cta: { title: d.cta.title, text: d.cta.text, open: d.cta.open, openActive: d.active.open, reset: d.active.reset, confirmReset: d.active.confirmReset },
      backCta: {
        title: t.backDesigner.title,
        text: t.backDesigner.text,
        open: t.backDesigner.open,
        active: t.backDesigner.active,
        openActive: t.backDesigner.openActive,
        reset: t.backDesigner.reset,
        confirmReset: t.backDesigner.confirmReset,
        readonly: t.backDesigner.readonly,
      },
      replace: { titleTemplate: t.replaceTitle("{name}"), text: t.replaceText, ok: t.replaceOk, cancel: m.common.actions.cancel },
      backFill: {
        title: t.backFill.title,
        likeFront: t.backFill.likeFront,
        own: t.backFill.own,
        likeFrontNote: t.backFill.likeFrontNote,
        ownNote: t.backFill.ownNote,
        color: t.backFill.color,
        frontColors: t.backFill.frontColors,
        more: t.backFill.more,
      },
      frame: { title: sx.frameTitle, hint: m.books.coverPhotos.frameHintTouch, zoom: t.frame.zoom, reset: t.frame.reset, slotPrefix: t.frame.slot(1).replace(/\s*1$/, "") },
      panels: { add: d.panels.add, layouts: d.panels.layouts, background: d.panels.background, properties: d.panels.properties, layers: d.panels.layers, fill: sx.tabs.fill },
      toolbar: {
        undo: d.toolbar.undo,
        redo: d.toolbar.redo,
        duplicate: d.toolbar.duplicate,
        remove: d.toolbar.remove,
        front: d.toolbar.front,
        forward: d.toolbar.forward,
        backward: d.toolbar.backward,
        back: d.toolbar.back,
        lock: d.toolbar.lock,
        unlock: d.toolbar.unlock,
        hide: d.toolbar.hide,
        show: d.toolbar.show,
        safe: d.toolbar.safe,
        grid: d.toolbar.grid,
        alignTitle: d.toolbar.alignTitle,
        alignLeft: d.toolbar.align.left,
        alignCenter: d.toolbar.align.center,
        alignRight: d.toolbar.align.right,
        alignTop: d.toolbar.align.top,
        alignMiddle: d.toolbar.align.middle,
        alignBottom: d.toolbar.align.bottom,
        backToTemplate: d.toolbar.back2,
      },
      add: {
        text: d.add.text,
        photo: d.add.photo,
        bookPhotos: d.add.bookPhotos,
        noBookPhotos: d.add.noBookPhotos,
        upload: d.add.upload,
        stock: d.add.stock,
        shapes: d.add.shapes,
        decor: d.add.decor,
        limit: d.add.limit,
      },
      layers: {
        empty: d.layers.empty,
        hint: d.layers.hint,
        rename: d.layers.rename,
        kindText: d.layers.kinds.text,
        kindImage: d.layers.kinds.image,
        kindShape: d.layers.kinds.shape,
        kindDecor: d.layers.kinds.decor,
        bindTitle: d.layers.binds.title,
        bindSubtitle: d.layers.binds.subtitle,
        bindNames: d.layers.binds.names,
      },
      props: {
        nothing: d.props.nothing,
        none: d.props.none,
        position: d.props.position,
        x: d.props.x,
        y: d.props.y,
        w: d.props.w,
        h: d.props.h,
        rotate: d.props.rotate,
        opacity: d.props.opacity,
        mm: d.props.mm,
        pt: d.props.pt,
        deg: d.props.deg,
        pct: d.props.pct,
        fullCover: d.props.cover,
        text: {
          title: d.props.text.title,
          content: d.props.text.content,
          linkedTitle: d.props.text.linked(d.layers.binds.title),
          linkedSubtitle: d.props.text.linked(d.layers.binds.subtitle),
          linkedNames: d.props.text.linked(d.layers.binds.names),
          unlink: d.props.text.unlink,
          font: d.props.text.font,
          fontSearch: du.fonts.search,
          fontEmpty: du.fonts.empty,
          weight: du.weight,
          italic: du.italic,
          size: d.props.text.size,
          color: d.props.text.color,
          tracking: d.props.text.tracking,
          lineHeight: d.props.text.lineHeight,
          align: d.props.text.align,
          valign: d.props.text.valign,
          underline: d.props.text.underline,
          upper: d.props.text.upper,
          effects: d.props.text.effects,
          shadow: d.props.text.shadow,
          shadowX: d.props.text.shadowX,
          shadowY: d.props.text.shadowY,
          outline: d.props.text.outline,
          outlineWidth: d.props.text.outlineWidth,
          plate: d.props.text.plate,
          plateRadius: d.props.text.plateRadius,
          platePad: d.props.text.platePad,
          effectsNote: d.props.text.effectsNote,
        },
        image: {
          title: d.props.image.title,
          source: d.props.image.source,
          crop: d.props.image.crop,
          cropDone: d.props.image.cropDone,
          cropHint: d.props.image.cropHint,
          zoom: d.props.image.zoom,
          resetFrame: d.props.image.resetFrame,
          mask: d.props.image.mask,
          radius: d.props.image.radius,
          border: d.props.image.border,
          borderWidth: d.props.image.borderWidth,
          mono: d.props.image.mono,
          overlay: d.props.image.overlay,
          empty: d.props.image.empty,
          lowResPrefix: d.props.image.lowRes(0),
        },
        shape: {
          title: d.props.shape.title,
          kind: d.props.shape.kind,
          fill: d.props.shape.fill,
          gradient: d.props.shape.gradient,
          gradientTo: d.props.shape.gradientTo,
          angle: d.props.shape.angle,
          stroke: d.props.shape.stroke,
          strokeWidth: d.props.shape.strokeWidth,
          radius: d.props.shape.radius,
        },
        decor: {
          title: d.props.decor.title,
          motif: d.props.decor.motif,
          color: d.props.decor.color,
          accent: d.props.decor.accent,
          artNote: d.props.decor.artNote,
        },
        background: {
          title: d.props.background.title,
          titleBack: d.props.background.titleBack,
          likeFront: d.props.background.likeFront,
          color: d.props.background.color,
          fromColor: d.props.background.from,
          toColor: d.props.background.to,
          angle: d.props.background.angle,
          templateNote: d.props.background.templateNote,
          likeFrontNote: d.props.background.likeFrontNote,
        },
      },
      layouts: {
        title: dl.title,
        text: dl.text,
        photosNote: dl.photosNote,
        search: dl.search,
        empty: dl.empty,
        apply: dl.apply,
        backTitle: d.backLayouts.title,
        backText: d.backLayouts.text,
      },
      canvas: {
        wrap: d.canvas.wrap,
        spine: d.canvas.spine,
        placeholderTitle: d.canvas.placeholders.title,
        placeholderSubtitle: d.canvas.placeholders.subtitle,
        placeholderNames: d.canvas.placeholders.names,
        placeholderText: d.canvas.placeholders.text,
        imagePlaceholder: d.canvas.image,
        unsafeWarning: d.warnings.unsafe,
        unsafeShow: d.warnings.show,
      },
      namesSwap: t.namesSwap,
      namesAuto: t.namesAuto,
      retry: m.common.actions.retry,
      loadError: m.common.errorPage.title,
    },
  };
}

async function view(book: BookRow, viewer: BookViewer) {
  const locale = (await getLocale()) === "kk" ? "kk" : "ru";
  const m = messagesFor(locale);
  const moods = m.catalog.moods;
  const t = m.books.cover;
  const tb = t.back;
  const cover = toCover(book, viewer);
  const templates = pickerCovers().filter((x) => !x.hidden).map((x) => toTemplate(x, book.format, locale));
  const slots = coverPhotoSlots(getCoverTemplate(book.coverTemplate));
  const kind = cover.kind;
  const names = cover.namesOnCover.trim() || cover.autoNames;
  const author = book.authorName.trim();
  return {
    cover,
    templates,
    moods: [{ id: "all", label: moods.all }, ...coverMoods.map((id) => ({ id, label: moods[id] }))],
    // Варианты оборота — те же, что у сайта (BackSection): подписи и подсказки по виду книги, число фото — BACK_PHOTO_SLOTS.
    backLayouts: backLayouts.map((id) => {
      const photos = BACK_PHOTO_SLOTS[id] ?? 0;
      const text = id !== "minimal";
      return {
        id,
        name: tb.layouts[id].name,
        hint: tb.layouts[id].hint,
        label: text ? tb.label[id as keyof typeof tb.label] : null,
        placeholder: text ? ((kind !== "gift" ? tb.placeholderByKind[kind]?.[id] : undefined) ?? tb.placeholder[id as keyof typeof tb.placeholder]) : null,
        note: text ? null : tb.minimalNote(names || tb.namesFallback[kind], cover.year),
        photos,
        photosLabel: photos ? (photos > 1 ? tb.photosPick(photos) : tb.photo) : null,
      };
    }),
    limits: { ...COVER_TEXT_MAX },
    labels: {
      title: t.title,
      designSwitch: { cover: m.bookStudio.nav.designSwitch.cover, pages: m.bookStudio.nav.designSwitch.pages },
      saving: m.common.actions.saving,
      sides: { front: t.side.front, back: t.side.back },
      tabs: { designs: m.design.ui.studio.cover.tabs.designs, photo: m.design.ui.studio.cover.tabs.photo, text: m.design.ui.studio.cover.tabs.text, variant: m.design.ui.studio.cover.tabs.variant },
      variants: m.common.count.variants(templates.length),
      shown: PICKER_SHOWN,
      showAll: t.showAllDesigns(templates.length),
      onCover: t.onCover,
      designActive: m.design.cover.active.text,
      readonly: m.design.cover.readonly,
      photo: { title: slots > 1 ? t.photos(slots) : t.photo, slots: Array.from({ length: slots }, (_, i) => t.frame.slot(i + 1)), slotsHint: t.photoSlotsHint, uploadFirst: t.uploadFirst, note: m.books.coverPhotos.note },
      text: {
        bookTitle: t.bookTitle,
        subtitle: t.subtitle,
        subtitlePlaceholder: t.subtitlePlaceholder,
        author: kind === "autobiography" ? t.narratorName : t.authorName,
        recordedBy: t.recordedBy,
        recordedByPlaceholder: t.recordedByPlaceholder,
        recipientNone: t.recipientNone,
        hideRecipient: t.hideRecipient,
        namesOnCover: t.namesOnCover,
        namesOnCoverText: t.namesOnCoverText,
        coverLines: t.coverLines,
        coverLinesHint: t.coverLinesHint,
      },
      back: { title: tb.title, text: tb.text, noPhotos: tb.noPhotos, signed: author ? tb.signed(author) : null },
    },
    designer: designerCatalog(book, locale),
  };
}

export const coverHandlers: Pick<Handlers, "coverGet" | "coverUpdate" | "coverDesignSave" | "coverDesignInit" | "coverDesignReset"> = {
  async coverGet({ req, input }) {
    const { book, viewer } = await apiBook(req, input.bookId);
    return view(book, viewer);
  },

  async coverUpdate({ req, input }) {
    const { viewer } = await apiBook(req, input.bookId, { editable: true });
    const authoring = container().authoring;
    await authoring.books.updateSettings(input.bookId, viewer, input.body, authoring.photoRepository);
    const book = await authoring.queries.book(input.bookId);
    return view(book!, viewer);
  },

  async coverDesignSave({ req, input }) {
    const { viewer } = await apiBook(req, input.bookId, { editable: true });
    const authoring = container().authoring;
    const { coverDesign, coverBack, photoFrames, ...rest } = input.body;
    const patch: Parameters<typeof authoring.books.updateSettings>[2] = { ...rest };
    if (coverDesign !== undefined) patch.coverDesign = coverDesign === null ? null : parseCoverDesign(coverDesign);
    if (coverBack !== undefined) patch.coverBack = coverBack === null ? null : normalBack(parseCoverBack(coverBack));
    if (photoFrames !== undefined) {
      const map: FrameMap = {};
      for (const item of photoFrames) map[item.key] = item.frame;
      patch.photoFrames = map;
    }
    await authoring.books.updateSettings(input.bookId, viewer, patch, authoring.photoRepository);
    const book = await authoring.queries.book(input.bookId);
    return view(book!, viewer);
  },

  async coverDesignInit({ req, input }) {
    const { book, viewer } = await apiBook(req, input.bookId, { editable: true });
    const authoring = container().authoring;
    const format = getFormat(book.format);
    const names = coverNames(book);
    const texts = { title: book.title, subtitle: book.subtitle, names };

    if (input.body.side === "front") {
      if (input.body.layoutId) {
        const layout = coverLayouts.find((l) => l.id === input.body.layoutId);
        if (!layout) throw new HttpError(400, "badRequest");
        const photos = await authoring.queries.photos(book.id);
        const design = layout.build({
          texts,
          format,
          photos: photos.map((p) => ({ id: p.id, width: p.width, height: p.height })),
        });
        await authoring.books.updateSettings(
          input.bookId,
          viewer,
          { coverDesign: design, ...(layout.template ? { coverTemplate: layout.template } : {}) },
          authoring.photoRepository,
        );
      } else if (!parseCoverDesign(book.coverDesign)) {
        const tpl = getCoverTemplate(book.coverTemplate, book.coverLines);
        const design = designFromTemplate(coverMeta(tpl), texts, format);
        await authoring.books.updateSettings(input.bookId, viewer, { coverDesign: design }, authoring.photoRepository);
      }
    } else {
      const existingBack = parseCoverBack(book.coverBack);
      const backBg: CoverBackground = existingBack?.background ?? { kind: "template" };
      const requested = input.body.backLayout;
      if (requested && !backLayouts.includes(requested as BackLayout)) throw new HttpError(400, "badRequest");
      const layoutId: BackLayout = (requested as BackLayout | undefined) ?? (backLayouts.includes(book.backLayout as BackLayout) ? (book.backLayout as BackLayout) : "quote");
      if (requested || !existingBack?.layers) {
        const photos = await authoring.queries.photos(book.id);
        const need = BACK_PHOTO_SLOTS[layoutId] ?? 0;
        const ids = [book.backPhotoId, ...(book.backPhotoExtra ?? [])].filter((id): id is string => !!id && photos.some((p) => p.id === id));
        for (const p of photos) if (ids.length < need && !ids.includes(p.id)) ids.push(p.id);
        const picked = ids.flatMap((id) => photos.filter((p) => p.id === id));
        const frontDesign = parseCoverDesign(book.coverDesign);
        const tpl = templateForCover(getCoverTemplate(book.coverTemplate, book.coverLines), frontDesign, { v: 1, background: backBg });
        const spread = coverSpreadGeometry(format, PREVIEW_PAGES);
        const rect = spread.back!;
        const content = {
          ...backContent(book, picked, new Date()),
          layout: layoutId,
          photos: picked.map((p) => ({ width: p.width, height: p.height })),
        };
        const backDesign = designBack(tpl, rect.w, rect.h, content);
        const frames = parseFrames(book.photoFrames);
        const layers = backLayersFromLayout(backDesign, rect.w, rect.h, {
          photoIds: ids,
          frames: ids.map((_, i) => frames[frameKey("back", i)]),
          names,
        });
        await authoring.books.updateSettings(input.bookId, viewer, { coverBack: { v: 1, background: backBg, layers } }, authoring.photoRepository);
      }
    }

    const updated = await authoring.queries.book(input.bookId);
    return view(updated!, viewer);
  },

  async coverDesignReset({ req, input }) {
    const { book, viewer } = await apiBook(req, input.bookId, { editable: true });
    const authoring = container().authoring;
    if (input.body.side === "front") {
      const patch: Parameters<typeof authoring.books.updateSettings>[2] = { coverDesign: null };
      if (input.body.coverTemplate !== undefined) patch.coverTemplate = input.body.coverTemplate;
      if (input.body.coverPhotoId !== undefined) patch.coverPhotoId = input.body.coverPhotoId;
      if (input.body.coverPhotoExtra !== undefined) patch.coverPhotoExtra = input.body.coverPhotoExtra;
      await authoring.books.updateSettings(input.bookId, viewer, patch, authoring.photoRepository);
    } else {
      const existingBack = parseCoverBack(book.coverBack);
      const backBg: CoverBackground = existingBack?.background ?? { kind: "template" };
      await authoring.books.updateSettings(input.bookId, viewer, { coverBack: normalBack({ v: 1, background: backBg }) }, authoring.photoRepository);
    }
    const updated = await authoring.queries.book(input.bookId);
    return view(updated!, viewer);
  },
};
