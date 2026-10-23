"use client";

/**
 * Конструктор обложки: слева — что добавить, макеты и фон; в центре — холст; справа — свойства выбранного слоя и
 * список слоёв. На телефоне — холст сверху, панели вкладками под ним. Панель инструментов: отмена и повтор,
 * дублировать, удалить, порядок слоёв, выравнивание, буфер стиля, закрепить, скрыть, масштаб холста.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  ClipboardPaste,
  CopyPlus,
  Eye,
  EyeOff,
  Grid3x3,
  Lock,
  LockOpen,
  Paintbrush,
  Redo2,
  ScanLine,
  Trash2,
  TriangleAlert,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useMessages } from "@/i18n/client";
import { backgroundBase, boardSize, canvasGeometry, decorDrawing, inkOn, parseCoverDesign, safeArea, type CoverBackground, type CoverDesign, type CoverLayer, type CoverTexts, type DecorId, type ShapeKind, type TextBind } from "@/lib/book/cover-design";
import type { PhotoRef } from "@/lib/book/covers/svg-kit";
import { getFormat } from "@/lib/book/formats";
import { getCoverTemplate } from "@/lib/book/covers";
import { cn } from "@/lib/class-names";
import { AddPanel } from "./AddPanel";
import { DesignerCanvas } from "./DesignerCanvas";
import { LayersPanel } from "./LayersPanel";
import { addLayer, alignBox, designColors, duplicateLayer, findLayer, moveZ, newDecorLayer, newImageLayer, newShapeLayer, newTextLayer, removeLayer, reorder, unsafeTextLayers, updateLayer, type AlignHow, type TextPreset, type ZMove } from "./logic";
import { COVER_SWATCHES, PropertiesPanel } from "./PropertiesPanel";
import { useDesigner } from "./useDesigner";
import { DesignAiPanel } from "@/components/design/DesignAiPanel";
import { applyCoverOps } from "@/lib/book/design-ai/ops";
import { DesignedCover } from "../DesignedCover";

type Tab = "ai" | "add" | "layouts" | "background" | "properties" | "layers";

const ZOOMS = [1, 1.5, 2];

/** Поле ввода в фокусе — горячие клавиши конструктора не перехватываем. */
const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export interface CoverDesignerProps {
  bookId: string;
  template: string;
  format: string;
  initial: CoverDesign;
  texts: CoverTexts;
  /** Фото клиента в местах шаблона (фон — рисунок шаблона). */
  templatePhotos?: (PhotoRef | undefined)[];
  bookPhotos: { id: string; width: number; height: number }[];
  editable: boolean;
  onChange: (design: CoverDesign) => void;
  onBookText: (bind: TextBind, value: string) => void;
  /** Вкладка «Макеты»: выбор готового макета (onPick ставит его как новый шаг истории). */
  layouts?: (onPick: (design: CoverDesign, template?: string) => void) => ReactNode;
  /** Макет на рисунке шаблона — сменить шаблон книги. */
  onTemplate?: (id: string) => void;
  /** Строка над холстом справа (сохранение). */
  status?: ReactNode;
}

export function CoverDesigner({ bookId, template, format: formatId, initial, texts, templatePhotos, bookPhotos, editable, onChange, onBookText, layouts, onTemplate, status }: CoverDesignerProps) {
  const m = useMessages().design.cover;
  const tb = m.toolbar;
  const dz = useDesigner(initial, onChange, texts);
  const { design, selected } = dz;
  const format = getFormat(formatId);
  const board = boardSize(format);
  const safe = safeArea(format);
  const g = canvasGeometry(format, 8);
  const layer = findLayer(design, selected);
  const [tab, setTab] = useState<Tab>("add");
  const [editing, setEditing] = useState<string | null>(null);
  const [cropping, setCropping] = useState<string | null>(null);
  const [showSafe, setShowSafe] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [zoom, setZoom] = useState(1);
  const swatches = [...new Set([...designColors(design), ...COVER_SWATCHES])].slice(0, 14);
  const unsafe = unsafeTextLayers(design, safe, texts, board);
  const full = design.layers.length >= 40;
  // Новые надписи — контрастным к своему фону цветом; на рисунке шаблона — тёмным.
  // Рисунок шаблона — по основному цвету его образца (swatch), свой фон — по его цвету.
  const base = backgroundBase(design.background) ?? /#[0-9a-fA-F]{6}/.exec(getCoverTemplate(template).swatch)?.[0] ?? null;
  const accent = base && inkOn(base) !== "#1F1A17" ? "#F3D9A4" : "#1F1A17";

  /** Новый слой — поверх, выбран. */
  const add = (l: CoverLayer) => {
    if (full || !editable) return;
    dz.commit((d) => addLayer(d, l));
    dz.select(l.id);
    setTab("properties");
  };
  const onText = (p: TextPreset) => add(newTextLayer(design, p, m.add.newText[p], safe, accent));
  const onImage = (src: { photoId?: string; stock?: string; aspect: number }) => {
    // Выбран слой-фото — меняем снимок в нём; иначе — новый слой.
    if (layer?.kind === "image") {
      dz.patch(layer.id, (l) => ({ ...l, photoId: src.photoId ?? null, stock: src.stock ?? null, frame: undefined }) as CoverLayer);
      return;
    }
    add(newImageLayer(design, src, safe, board, src.aspect));
  };
  const onShape = (s: ShapeKind) => add(newShapeLayer(design, s, safe, board, accent === "#1F1A17" ? "#B8925A" : accent));
  const onDecor = (motif: DecorId) => {
    const d = decorDrawing(motif, "#000000");
    add(newDecorLayer(design, motif, safe, board, accent === "#1F1A17" ? "#B8925A" : accent, d.w / d.h));
  };

  const act = {
    remove: () => {
      if (!layer || !editable) return;
      dz.commit((d) => removeLayer(d, layer.id));
      dz.select(null);
    },
    duplicate: () => {
      if (!layer || !editable) return;
      const r = duplicateLayer(design, layer.id, texts);
      if (!r.id) return;
      dz.commit(() => r.design);
      dz.select(r.id);
    },
    z: (how: ZMove) => layer && editable && dz.commit((d) => moveZ(d, layer.id, how)),
    align: (how: AlignHow) => layer && editable && !layer.locked && dz.patch(layer.id, (l) => ({ ...l, ...alignBox(l, how, safe) })),
    toggle: (field: "locked" | "hidden") => layer && editable && dz.patch(layer.id, (l) => ({ ...l, [field]: l[field] ? undefined : true })),
    nudge: (dx: number, dy: number) => layer && editable && !layer.locked && dz.patch(layer.id, (l) => ({ ...l, x: Math.round((l.x + dx) * 10000) / 10000, y: Math.round((l.y + dy) * 10000) / 10000 }), `nudge:${layer.id}`),
  };

  // Горячие клавиши — пока конструктор открыт и фокус не в поле ввода.
  const keys = useRef({ dz, act, layer, editable, cropping });
  useLayoutEffect(() => {
    keys.current = { dz, act, layer, editable, cropping };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      const { dz: d, act: a, layer: l, editable: ok, cropping: crop } = keys.current;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (!ok) return;
      if (mod && k === "z") {
        e.preventDefault();
        if (e.shiftKey) d.redo();
        else d.undo();
      } else if (mod && k === "y") {
        e.preventDefault();
        d.redo();
      } else if (mod && k === "d") {
        e.preventDefault();
        a.duplicate();
      } else if (mod && k === "c" && !e.altKey) {
        if (l && !window.getSelection()?.toString()) d.copyLayer();
      } else if (mod && k === "v" && !e.altKey) {
        if (d.hasClipboard) {
          e.preventDefault();
          d.pasteLayer();
        }
      } else if (mod && e.altKey && k === "c") {
        e.preventDefault();
        d.copyStyleOf();
      } else if (mod && e.altKey && k === "v") {
        e.preventDefault();
        d.pasteStyleTo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && l) {
        e.preventDefault();
        a.remove();
      } else if (e.key === "Escape") {
        if (crop) setCropping(null);
        else d.select(null);
      } else if (e.key.startsWith("Arrow") && l) {
        e.preventDefault();
        const step = (e.shiftKey ? 10 : 1) * 0.0025;
        a.nudge(e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0, e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const setBackground = (bg: CoverBackground, field: string) => dz.commit((d) => ({ ...d, background: bg }), `bg:${field}`);

  const pickLayout = (d: CoverDesign, tpl?: string) => {
    dz.commit(() => d);
    dz.select(null);
    if (tpl && tpl !== template) onTemplate?.(tpl);
  };

  const panels: Record<Tab, ReactNode> = {
    ai: (
      <DesignAiPanel
        bookId={bookId}
        target="cover"
        editable={editable}
        payload={() => ({ state: { template, design } })}
        onApply={(patch) => {
          const d = parseCoverDesign(patch.coverDesign);
          if (d) pickLayout(d, patch.coverTemplate);
        }}
        applyOps={(ops) => {
          const r = applyCoverOps({ template, design }, ops, format, { texts, photos: bookPhotos });
          if (JSON.stringify(r.state) === JSON.stringify({ template, design })) return false;
          pickLayout(r.state.design, r.state.template);
          return true;
        }}
        renderPreview={(patch, key) => {
          const d = parseCoverDesign(patch.coverDesign);
          return d ? <DesignedCover template={patch.coverTemplate ?? template} format={formatId} design={d} texts={texts} photos={templatePhotos} uid={`ai${key}`} lite className="shadow-soft" /> : null;
        }}
        previewMin={110}
        onUndo={dz.undo}
      />
    ),
    add: <AddPanel bookId={bookId} bookPhotos={bookPhotos} disabled={full || !editable} onText={onText} onImage={onImage} onShape={onShape} onDecor={onDecor} />,
    layouts: layouts ? layouts(pickLayout) : null,
    background: (
      <PropertiesPanel layer={null} design={design} texts={texts} board={board} bookId={bookId} bookPhotos={bookPhotos} swatches={swatches} patch={() => {}} setBackground={setBackground} onBookText={onBookText} onCrop={setCropping} />
    ),
    properties: (
      <PropertiesPanel
        layer={layer}
        design={design}
        texts={texts}
        board={board}
        bookId={bookId}
        bookPhotos={bookPhotos}
        swatches={swatches}
        patch={(fn, field) => layer && dz.patch(layer.id, fn, `p:${layer.id}:${field}`)}
        setBackground={setBackground}
        onBookText={onBookText}
        onCrop={(id) => setCropping(id)}
      />
    ),
    layers: (
      <LayersPanel
        design={design}
        texts={texts}
        selected={selected}
        editable={editable}
        onSelect={(id) => dz.select(id)}
        onReorder={(from, to) => dz.commit((d) => reorder(d, from, to))}
        onPatch={(id, p, field) => dz.commit((d) => updateLayer(d, id, p), `p:${id}:${field}`)}
      />
    ),
  };
  const leftTabs: Tab[] = layouts ? ["add", "ai", "layouts", "background"] : ["add", "ai", "background"];
  const mobileTabs: Tab[] = layouts ? ["add", "ai", "properties", "layers", "layouts", "background"] : ["add", "ai", "properties", "layers", "background"];
  const tabLabel = (k: Tab) => m.panels[k];
  const tabBar = (list: Tab[], current: Tab, className?: string) => (
    <div role="tablist" aria-label={m.panels.aria} className={cn("no-scrollbar flex gap-1 overflow-x-auto rounded-2xl bg-cream/80 p-1", className)}>
      {list.map((k) => (
        <button key={k} type="button" role="tab" aria-selected={current === k} onClick={() => setTab(k)} className={cn("h-9 shrink-0 rounded-xl px-3 text-sm transition", current === k ? "bg-white font-medium text-ink shadow-soft" : "text-muted hover:text-ink")}>
          {tabLabel(k)}
        </button>
      ))}
    </div>
  );

  const tool = (label: string, icon: ReactNode, onClick: () => void, disabled = false, pressed?: boolean) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-soft transition hover:bg-cream disabled:opacity-35 disabled:hover:bg-transparent", pressed && "bg-rose/70 text-wine")}
    >
      {icon}
    </button>
  );
  const sep = <span aria-hidden className="mx-0.5 h-6 w-px shrink-0 bg-line" />;
  const noLayer = !layer || !editable;
  const leftTab = leftTabs.includes(tab) ? tab : "add";

  return (
    <div className="space-y-4">
      {!editable ? <p className="rounded-xl bg-cream px-4 py-3 text-sm text-ink-soft">{m.readonly}</p> : null}
      {/* Панель инструментов */}
      <div className="no-scrollbar sticky top-16 z-20 flex items-center gap-0.5 overflow-x-auto rounded-2xl border border-line bg-white/95 p-1 shadow-soft backdrop-blur">
        {tool(tb.undo, <Undo2 className="size-4" />, dz.undo, !dz.canUndo || !editable)}
        {tool(tb.redo, <Redo2 className="size-4" />, dz.redo, !dz.canRedo || !editable)}
        {sep}
        {tool(tb.duplicate, <CopyPlus className="size-4" />, act.duplicate, noLayer || full)}
        {tool(tb.remove, <Trash2 className="size-4" />, act.remove, noLayer)}
        {sep}
        {tool(tb.front, <ArrowUpToLine className="size-4" />, () => act.z("front"), noLayer)}
        {tool(tb.forward, <ArrowUp className="size-4" />, () => act.z("up"), noLayer)}
        {tool(tb.backward, <ArrowDown className="size-4" />, () => act.z("down"), noLayer)}
        {tool(tb.back, <ArrowDownToLine className="size-4" />, () => act.z("back"), noLayer)}
        {sep}
        {tool(`${tb.alignTitle}: ${tb.align.left}`, <AlignStartVertical className="size-4" />, () => act.align("left"), noLayer)}
        {tool(`${tb.alignTitle}: ${tb.align.center}`, <AlignCenterVertical className="size-4" />, () => act.align("center"), noLayer)}
        {tool(`${tb.alignTitle}: ${tb.align.right}`, <AlignEndVertical className="size-4" />, () => act.align("right"), noLayer)}
        {tool(`${tb.alignTitle}: ${tb.align.top}`, <AlignStartHorizontal className="size-4" />, () => act.align("top"), noLayer)}
        {tool(`${tb.alignTitle}: ${tb.align.middle}`, <AlignCenterHorizontal className="size-4" />, () => act.align("middle"), noLayer)}
        {tool(`${tb.alignTitle}: ${tb.align.bottom}`, <AlignEndHorizontal className="size-4" />, () => act.align("bottom"), noLayer)}
        {sep}
        {tool(tb.copyStyle, <Paintbrush className="size-4" />, dz.copyStyleOf, noLayer)}
        {tool(tb.pasteStyle, <ClipboardPaste className="size-4" />, dz.pasteStyleTo, noLayer || dz.styleClip?.kind !== layer?.kind)}
        {tool(layer?.locked ? tb.unlock : tb.lock, layer?.locked ? <Lock className="size-4" /> : <LockOpen className="size-4" />, () => act.toggle("locked"), noLayer, !!layer?.locked)}
        {tool(layer?.hidden ? tb.show : tb.hide, layer?.hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />, () => act.toggle("hidden"), noLayer, !!layer?.hidden)}
        {sep}
        {tool(tb.safe, <ScanLine className="size-4" />, () => setShowSafe((v) => !v), false, showSafe)}
        {tool(tb.grid, <Grid3x3 className="size-4" />, () => setShowGrid((v) => !v), false, showGrid)}
        {tool(tb.zoomOut, <ZoomOut className="size-4" />, () => setZoom((z) => ZOOMS[Math.max(0, ZOOMS.indexOf(z) - 1)]), zoom === ZOOMS[0])}
        <button type="button" onClick={() => setZoom(1)} className="h-9 shrink-0 rounded-lg px-1.5 text-xs text-muted tabular-nums hover:bg-cream" title={tb.fit}>
          {Math.round(zoom * 100)}%
        </button>
        {tool(tb.zoomIn, <ZoomIn className="size-4" />, () => setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(z) + 1)]), zoom === ZOOMS[ZOOMS.length - 1])}
        {status ? <div className="ml-auto shrink-0 pr-2 pl-3">{status}</div> : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)_320px] lg:items-start">
        {/* Слева: добавить, макеты, фон */}
        <aside className="hidden max-h-[calc(100dvh-9rem)] space-y-4 overflow-y-auto pr-1 lg:sticky lg:top-32 lg:block">
          {tabBar(leftTabs, leftTab)}
          {panels[leftTab]}
        </aside>

        {/* Холст */}
        <div className="min-w-0">
          {unsafe.length ? (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <TriangleAlert className="size-4 shrink-0" />
              <span>{m.warnings.unsafe}</span>
              <button
                type="button"
                className="font-medium underline-offset-2 hover:underline"
                onClick={() => {
                  dz.select(unsafe[0].id);
                  setTab("properties");
                }}
              >
                {m.warnings.show}
              </button>
            </div>
          ) : null}
          <div className="overflow-auto rounded-[24px] bg-cream/70 px-3 pt-12 pb-6 sm:px-8">
            <div className="mx-auto" style={{ width: `${zoom * 100}%`, maxWidth: zoom === 1 ? `calc(74dvh * ${g.width / g.height})` : undefined }}>
              <DesignerCanvas
                dz={dz}
                template={template}
                format={format.id}
                texts={texts}
                photos={templatePhotos}
                bookPhotos={bookPhotos}
                editable={editable}
                showSafe={showSafe}
                showGrid={showGrid}
                editing={editing}
                setEditing={setEditing}
                cropping={cropping}
                setCropping={(id) => {
                  setCropping(id);
                  if (id) dz.select(id);
                }}
                onBookText={onBookText}
                labels={{ aria: m.canvas.aria, wrap: m.canvas.wrap, rotate: m.canvas.rotate, resize: m.canvas.resize, editText: m.canvas.editText, image: m.canvas.image, placeholders: m.canvas.placeholders }}
              />
            </div>
          </div>
          {cropping ? (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-sm text-muted">
              <span>{m.props.image.cropHint}</span>
              <button type="button" className="btn btn-dark btn-sm" onClick={() => setCropping(null)}>
                {m.props.image.cropDone}
              </button>
            </div>
          ) : (
            <p className="mt-3 text-center text-xs text-muted max-lg:hidden">{m.canvas.hint}</p>
          )}
          {/* Телефон и планшет: панели вкладками под холстом */}
          <div className="mt-5 space-y-4 lg:hidden">
            {tabBar(mobileTabs, tab)}
            {panels[tab]}
          </div>
        </div>

        {/* Справа: свойства и слои */}
        <aside className="hidden max-h-[calc(100dvh-9rem)] space-y-6 overflow-y-auto pr-1 lg:sticky lg:top-32 lg:block">
          <div>
            <h3 className="mb-3 text-sm font-semibold">{layer ? m.panels.properties : m.props.background.title}</h3>
            {layer ? panels.properties : panels.background}
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold">{m.panels.layers}</h3>
            {panels.layers}
          </div>
        </aside>
      </div>
    </div>
  );
}
