"use client";

/**
 * Конструктор обложки в раме студии: слева — ИИ, что добавить, макеты и фон; в центре — холст с панелью (отмена,
 * дублировать, удалить, безопасная зона, сетка, масштаб); справа — свойства выбранного слоя (порядок, выравнивание,
 * стиль, закрепить и скрыть — в их начале) и список слоёв. На телефоне — холст закреплён сверху, панели — вкладками
 * листа под ним.
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
  Sparkles,
  Trash2,
  TriangleAlert,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useMessages } from "@/i18n/client";
import { backgroundBase, boardSize, canvasGeometry, decorDrawing, inkOn, parseCoverDesign, safeArea, type CoverBackground, type CoverDesign, type CoverLayer, type CoverSide, type CoverTexts, type DecorId, type ShapeKind, type TextBind } from "@/lib/book/cover-design";
import type { BackDesign } from "@/lib/book/cover-back";
import type { PhotoRef } from "@/lib/book/covers/svg-kit";
import { getFormat } from "@/lib/book/formats";
import { getCoverTemplate } from "@/lib/book/covers";
import { cn } from "@/lib/class-names";
import { PanelBody, StudioFrame, StudioStage } from "@/components/design/studio/Frame";
import { StudioTabs, type StudioTab } from "@/components/design/studio/Tabs";
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
  /** Панель студии над колонками (заголовок, режимы, сохранение) — её рисует редактор обложки. */
  bar: ReactNode;
  /** Вместо холста на сцене: обложка целиком или книга в объёме (холст и история правок остаются). */
  stageSwap?: ReactNode;
  /** Поверх сцены сверху: переключатели стороны и вида. */
  stageOverlay?: ReactNode;
  /** Сторона: лицо или оборот (у оборота свой фон холста, безопасная зона у корешка справа, ИИ нет). */
  side?: CoverSide;
  /**
   * Конструктор на экране. Конструкторы лица и оборота живут одновременно (у каждого своя история отмены), горячие
   * клавиши слушает только видимый.
   */
  active?: boolean;
  /** Фон холста оборота: SVG окна с загибом (cover-sides). */
  backdrop?: string;
  /** Цвет, на котором лежат новые надписи, если фон — «как спереди» (рисунок шаблона или фон лица). */
  baseColor?: string | null;
  /** Марка на обороте — видна на холсте, но не слой. */
  brand?: { design: BackDesign; name: string };
  /** Под слоями холста (оборот «как спереди» — фото, фигуры и украшения лица). */
  underlay?: CoverLayer[];
  /** Цвета другой стороны — первыми в образцах (оборот в тон лица). */
  colors?: string[];
}

export function CoverDesigner({
  bookId,
  template,
  format: formatId,
  initial,
  texts,
  templatePhotos,
  bookPhotos,
  editable,
  onChange,
  onBookText,
  layouts,
  onTemplate,
  bar,
  stageSwap,
  stageOverlay,
  side = "front",
  active = true,
  backdrop,
  baseColor,
  brand,
  colors = [],
  underlay,
}: CoverDesignerProps) {
  const m = useMessages().design.cover;
  const tb = m.toolbar;
  const dz = useDesigner(initial, onChange, texts);
  const { design, selected } = dz;
  const format = getFormat(formatId);
  const board = boardSize(format);
  const safe = safeArea(format, side);
  const g = canvasGeometry(format, 8);
  const back = side === "back";
  const layer = findLayer(design, selected);
  const [tab, setTab] = useState<Tab>("add");
  const [rightTab, setRightTab] = useState<"properties" | "layers">("properties");
  const [editing, setEditing] = useState<string | null>(null);
  const [cropping, setCropping] = useState<string | null>(null);
  const [showSafe, setShowSafe] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [zoom, setZoom] = useState(1);
  const swatches = [...new Set([...colors, ...designColors(design), ...COVER_SWATCHES])].slice(0, 16);
  const unsafe = unsafeTextLayers(design, safe, texts, board);
  const full = design.layers.length >= 40;
  // Новые надписи — контрастным к своему фону цветом; на рисунке шаблона — тёмным.
  // Рисунок шаблона — по основному цвету его образца (swatch), свой фон — по его цвету.
  const base = backgroundBase(design.background) ?? baseColor ?? /#[0-9a-fA-F]{6}/.exec(getCoverTemplate(template).swatch)?.[0] ?? null;
  const accent = base && inkOn(base) !== "#1F1A17" ? "#F3D9A4" : "#1F1A17";

  /** Новый слой — поверх, выбран. */
  const add = (l: CoverLayer) => {
    if (full || !editable) return;
    dz.commit((d) => addLayer(d, l));
    dz.select(l.id);
    setTab("properties");
    setRightTab("properties");
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
  const keys = useRef({ dz, act, layer, editable, cropping, active });
  useLayoutEffect(() => {
    keys.current = { dz, act, layer, editable, cropping, active };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      const { dz: d, act: a, layer: l, editable: ok, cropping: crop, active: on } = keys.current;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (!ok || !on) return;
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
      <PropertiesPanel side={side} layer={null} design={design} texts={texts} board={board} bookId={bookId} bookPhotos={bookPhotos} swatches={swatches} patch={() => {}} setBackground={setBackground} onBookText={onBookText} onCrop={setCropping} />
    ),
    properties: (
      <PropertiesPanel
        side={side}
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
  // ИИ-дизайнер правит лицо: на обороте его вкладки нет.
  const leftTabs = (["ai", "add", "layouts", "background"] as Tab[]).filter((k) => (k !== "layouts" || layouts) && (k !== "ai" || !back));
  const mobileTabs = (["ai", "add", "properties", "layers", "layouts", "background"] as Tab[]).filter((k) => (k !== "layouts" || layouts) && (k !== "ai" || !back));
  const tabDef = (list: Tab[]): StudioTab<Tab>[] => list.map((k) => ({ id: k, label: m.panels[k], icon: k === "ai" ? Sparkles : undefined, count: k === "layers" && design.layers.length ? design.layers.length : undefined }));

  const tool = (label: string, icon: ReactNode, onClick: () => void, disabled = false, pressed?: boolean) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn("flex size-9 shrink-0 items-center justify-center rounded-[var(--r-ctl)] text-ink-soft transition hover:bg-sunken disabled:opacity-35 disabled:hover:bg-transparent pointer-coarse:size-11", pressed && "bg-rose text-wine")}
    >
      {icon}
    </button>
  );
  const sep = <span aria-hidden className="mx-0.5 h-6 w-px shrink-0 bg-line" />;
  const noLayer = !layer || !editable;
  const leftTab = leftTabs.includes(tab) ? tab : leftTabs.includes("add") ? "add" : leftTabs[0];

  /** Действия над выбранным слоем: порядок, выравнивание, стиль, закрепить и скрыть — в начале свойств, а не на панели сцены. */
  const layerTools = layer ? (
    <div className="mb-4 space-y-1.5 rounded-[var(--r-panel)] bg-sunken p-1.5">
      <div className="flex flex-wrap items-center gap-0.5">
        {tool(tb.front, <ArrowUpToLine className="size-4" />, () => act.z("front"), noLayer)}
        {tool(tb.forward, <ArrowUp className="size-4" />, () => act.z("up"), noLayer)}
        {tool(tb.backward, <ArrowDown className="size-4" />, () => act.z("down"), noLayer)}
        {tool(tb.back, <ArrowDownToLine className="size-4" />, () => act.z("back"), noLayer)}
        {sep}
        {tool(layer.locked ? tb.unlock : tb.lock, layer.locked ? <Lock className="size-4" /> : <LockOpen className="size-4" />, () => act.toggle("locked"), noLayer, !!layer.locked)}
        {tool(layer.hidden ? tb.show : tb.hide, layer.hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />, () => act.toggle("hidden"), noLayer, !!layer.hidden)}
        {sep}
        {tool(tb.copyStyle, <Paintbrush className="size-4" />, dz.copyStyleOf, noLayer)}
        {tool(tb.pasteStyle, <ClipboardPaste className="size-4" />, dz.pasteStyleTo, noLayer || dz.styleClip?.kind !== layer.kind)}
      </div>
      <div className="flex flex-wrap items-center gap-0.5">
        {tool(`${tb.alignTitle}: ${tb.align.left}`, <AlignStartVertical className="size-4" />, () => act.align("left"), noLayer)}
        {tool(`${tb.alignTitle}: ${tb.align.center}`, <AlignCenterVertical className="size-4" />, () => act.align("center"), noLayer)}
        {tool(`${tb.alignTitle}: ${tb.align.right}`, <AlignEndVertical className="size-4" />, () => act.align("right"), noLayer)}
        {sep}
        {tool(`${tb.alignTitle}: ${tb.align.top}`, <AlignStartHorizontal className="size-4" />, () => act.align("top"), noLayer)}
        {tool(`${tb.alignTitle}: ${tb.align.middle}`, <AlignCenterHorizontal className="size-4" />, () => act.align("middle"), noLayer)}
        {tool(`${tb.alignTitle}: ${tb.align.bottom}`, <AlignEndHorizontal className="size-4" />, () => act.align("bottom"), noLayer)}
      </div>
    </div>
  ) : null;
  const propsPanel = (
    <>
      {layerTools}
      {panels.properties}
    </>
  );
  const sheetPanel = tab === "properties" ? propsPanel : tab === "ai" ? null : panels[tab];
  const rightTabs: StudioTab<"properties" | "layers">[] = [
    { id: "properties", label: layer ? m.panels.properties : m.props.background.title },
    { id: "layers", label: m.panels.layers, count: design.layers.length || undefined },
  ];

  /** Панель над сценой: отмена и повтор, копия и удаление слоя, безопасная зона, сетка и масштаб. */
  const toolbar = (
    <div className="no-scrollbar flex items-center gap-0.5 overflow-x-auto rounded-[var(--r-panel)] border border-line bg-white p-1">
      {tool(tb.undo, <Undo2 className="size-4" />, dz.undo, !dz.canUndo || !editable)}
      {tool(tb.redo, <Redo2 className="size-4" />, dz.redo, !dz.canRedo || !editable)}
      {sep}
      {tool(tb.duplicate, <CopyPlus className="size-4" />, act.duplicate, noLayer || full)}
      {tool(tb.remove, <Trash2 className="size-4" />, act.remove, noLayer)}
      {sep}
      {tool(tb.safe, <ScanLine className="size-4" />, () => setShowSafe((v) => !v), false, showSafe)}
      {tool(tb.grid, <Grid3x3 className="size-4" />, () => setShowGrid((v) => !v), false, showGrid)}
      <span className="ml-auto flex shrink-0 items-center gap-0.5 pl-2">
        {tool(tb.zoomOut, <ZoomOut className="size-4" />, () => setZoom((z) => ZOOMS[Math.max(0, ZOOMS.indexOf(z) - 1)]), zoom === ZOOMS[0])}
        <button type="button" onClick={() => setZoom(1)} className="h-9 min-w-10 shrink-0 rounded-[var(--r-ctl)] px-1.5 text-xs text-muted tabular-nums hover:bg-sunken pointer-coarse:h-11" title={tb.fit}>
          {Math.round(zoom * 100)}%
        </button>
        {tool(tb.zoomIn, <ZoomIn className="size-4" />, () => setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(z) + 1)]), zoom === ZOOMS[ZOOMS.length - 1])}
      </span>
    </div>
  );

  const canvas = (
    <div className="absolute inset-0 overflow-auto px-3 pt-14 pb-4 sm:px-6" hidden={!!stageSwap}>
      <div className="mx-auto" style={{ width: zoom === 1 ? `min(100%, calc((100cqh - 4.5rem) * ${g.width / g.height}))` : `${zoom * 100}%` }}>
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
          side={side}
          backdrop={backdrop}
          underlay={underlay}
          brand={brand}
          labels={{ aria: back ? m.canvas.ariaBack : m.canvas.aria, wrap: m.canvas.wrap, spine: m.canvas.spine, rotate: m.canvas.rotate, resize: m.canvas.resize, editText: m.canvas.editText, image: m.canvas.image, placeholders: m.canvas.placeholders }}
        />
      </div>
    </div>
  );
  /** Сообщения поверх сцены внизу: слой у края (может уйти под загиб) или подсказка кадрирования. */
  const note = cropping ? (
    <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-center justify-center gap-2 rounded-[var(--r-panel)] bg-white/95 px-3 py-2 text-xs text-ink-soft">
      <span>{m.props.image.cropHint}</span>
      <button type="button" className="btn btn-dark btn-sm" onClick={() => setCropping(null)}>
        {m.props.image.cropDone}
      </button>
    </div>
  ) : unsafe.length ? (
    <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-center gap-2 rounded-[var(--r-panel)] bg-warning-bg px-3 py-2 text-[13px] text-warning">
      <TriangleAlert className="size-4 shrink-0" />
      <span>{m.warnings.unsafe}</span>
      <button
        type="button"
        className="font-medium underline-offset-2 hover:underline"
        onClick={() => {
          dz.select(unsafe[0].id);
          setTab("properties");
          setRightTab("properties");
        }}
      >
        {m.warnings.show}
      </button>
    </div>
  ) : null;

  return (
    <StudioFrame
      bar={bar}
      leftWidth={320}
      rightWidth={320}
      leftOnMobile={!back && tab === "ai"}
      left={
        <PanelBody tabs={<StudioTabs tabs={tabDef(leftTabs)} value={leftTab} onChange={setTab} label={m.panels.aria} />}>
          {!editable ? <p className="mb-3 rounded-[var(--r-ctl)] bg-cream px-3 py-2 text-[13px] text-ink-soft">{m.readonly}</p> : null}
          {panels[leftTab]}
        </PanelBody>
      }
      right={
        <PanelBody tabs={<StudioTabs tabs={rightTabs} value={rightTab} onChange={setRightTab} label={m.panels.aria} />}>{rightTab === "layers" ? panels.layers : propsPanel}</PanelBody>
      }
      stage={
        <StudioStage
          toolbar={toolbar}
          overlay={
            <>
              {stageOverlay}
              {stageSwap}
              {stageSwap ? null : note}
            </>
          }
          foot={<p className="hidden text-center text-xs text-muted lg:block">{m.canvas.hint}</p>}
        >
          {canvas}
        </StudioStage>
      }
      mobileTabs={<StudioTabs tabs={tabDef(mobileTabs)} value={tab} onChange={setTab} label={m.panels.aria} />}
      sheet={
        !back && tab === "ai" ? undefined : (
          <>
            {!editable ? <p className="mb-3 rounded-[var(--r-ctl)] bg-cream px-3 py-2 text-[13px] text-ink-soft">{m.readonly}</p> : null}
            {sheetPanel}
          </>
        )
      }
    />
  );
}
