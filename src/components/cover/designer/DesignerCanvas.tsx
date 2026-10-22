"use client";

/**
 * Холст конструктора: обложка с загибом вокруг крышки, рамка выбранного слоя с ручками размера и поворота,
 * направляющие прилипания, безопасная зона и сетка; правка текста прямо на обложке и кадрирование фото.
 * Жесты — pointer events (мышь, перо, палец); координаты указателя переводятся в доли крышки по её прямоугольнику.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { ImagePlus, Lock, RotateCw } from "lucide-react";
import { DesignedCover } from "@/components/cover/DesignedCover";
import { textCss } from "@/components/cover/CoverLayers";
import { boardSize, layerText, safeArea, type CoverLayer, type CoverTexts, type ImageLayer, type TextBind, type TextLayer } from "@/lib/book/cover-design";
import type { PhotoRef } from "@/lib/book/covers/svg-kit";
import { getFormat } from "@/lib/book/formats";
import { coverPhotoUrl } from "@/lib/book/photo-cover";
import { framedImageRect, MAX_ZOOM, normalizeFrame, panFrame, zoomFrame, type PhotoFrame } from "@/lib/book/photo-frame";
import { hexAlpha } from "@/lib/color";
import { cn } from "@/lib/class-names";
import { photoUrl } from "@/lib/urls";
import { clampBox, HANDLES, moveBox, pointerAngle, resizeBox, rotateAngle, snapMove, snapResize, snapTargets, type Box, type Guides, type Handle } from "./logic";
import type { Designer } from "./useDesigner";

/** Порог прилипания, px экрана. */
const SNAP_PX = 6;
const WHEEL_SPEED = 0.0016;

type Gesture =
  | { mode: "move"; id: string; x: number; y: number; rect: DOMRect; box: Box; key: string; moved: boolean }
  | { mode: "resize"; id: string; x: number; y: number; rect: DOMRect; box: Box; rotate: number; handle: Handle; size?: number; key: string }
  | { mode: "rotate"; id: string; rect: DOMRect; cx: number; cy: number; from: number; rotate: number; key: string }
  | { mode: "pan"; id: string; x: number; y: number; frame: PhotoFrame; boxPx: { w: number; h: number }; img: { width: number; height: number }; key: string };

export interface CanvasLabels {
  aria: string;
  wrap: string;
  rotate: string;
  resize: string;
  editText: string;
  image: string;
  placeholders: Record<TextBind | "text", string>;
}

const cursorOf: Record<Handle, string> = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize" };

const handlePos: Record<Handle, CSSProperties> = {
  nw: { left: 0, top: 0 },
  n: { left: "50%", top: 0 },
  ne: { left: "100%", top: 0 },
  e: { left: "100%", top: "50%" },
  se: { left: "100%", top: "100%" },
  s: { left: "50%", top: "100%" },
  sw: { left: 0, top: "100%" },
  w: { left: 0, top: "50%" },
};

const pct = (v: number) => `${v * 100}%`;

export function DesignerCanvas({
  dz,
  template,
  format: formatId,
  texts,
  photos,
  bookPhotos,
  editable,
  showSafe,
  showGrid,
  editing,
  setEditing,
  cropping,
  setCropping,
  onBookText,
  labels,
}: {
  dz: Designer;
  template: string;
  format: string;
  texts: CoverTexts;
  /** Фото клиента в местах шаблона (фон «шаблон»). */
  photos?: (PhotoRef | undefined)[];
  /** Фото книги — размеры снимков для кадрирования. */
  bookPhotos: { id: string; width: number; height: number }[];
  editable: boolean;
  showSafe: boolean;
  showGrid: boolean;
  editing: string | null;
  setEditing: (id: string | null) => void;
  cropping: string | null;
  setCropping: (id: string | null) => void;
  onBookText: (bind: TextBind, value: string) => void;
  labels: CanvasLabels;
}) {
  const format = getFormat(formatId);
  const board = boardSize(format);
  const safe = safeArea(format);
  const boardRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [guides, setGuides] = useState<Guides>({ x: [], y: [] });
  const [stockAspect, setStockAspect] = useState<Record<string, number>>({});
  const { design, selected } = dz;
  const selectedLayer = design.layers.find((l) => l.id === selected) ?? null;
  const latest = useRef({ dz, board, safe, cropping });
  useLayoutEffect(() => {
    latest.current = { dz, board, safe, cropping };
  });

  // Пропорции снимка коллекции — для кадрирования (свои фото книги знают размеры заранее).
  const croppingLayer = design.layers.find((l) => l.id === cropping);
  const croppingStock = croppingLayer?.kind === "image" && !croppingLayer.photoId ? croppingLayer.stock : null;
  useEffect(() => {
    if (!croppingStock || stockAspect[croppingStock]) return;
    const img = new Image();
    img.onload = () => setStockAspect((m) => ({ ...m, [croppingStock]: img.naturalWidth / img.naturalHeight }));
    img.src = coverPhotoUrl(croppingStock, 300);
  }, [croppingStock, stockAspect]);

  const imageDims = (l: ImageLayer): { width: number; height: number } | null => {
    if (l.photoId) {
      const p = bookPhotos.find((x) => x.id === l.photoId);
      return p ? { width: p.width, height: p.height } : null;
    }
    const a = l.stock ? stockAspect[l.stock] : undefined;
    return a ? { width: a * 1000, height: 1000 } : null;
  };

  // Колёсико в режиме кадра — масштаб снимка (свой слушатель: React вешает wheel пассивно).
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const { cropping: id, dz: d } = latest.current;
      if (!id) return;
      const l = d.design.layers.find((x) => x.id === id);
      if (l?.kind !== "image") return;
      e.preventDefault();
      const f = normalizeFrame(l.frame);
      d.patch(id, (x) => ({ ...(x as ImageLayer), frame: zoomFrame(f, Math.min(MAX_ZOOM, Math.max(1, f.zoom * (1 - e.deltaY * WHEEL_SPEED)))) }), `p:${id}:zoom`);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ─── жесты ──────────────────────────────────────────────────────────────

  const onMove = (e: PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const { dz: d, board: b, safe: s } = latest.current;
    const snap = !e.altKey;
    if (g.mode === "move") {
      const dx = (e.clientX - g.x) / g.rect.width;
      const dy = (e.clientY - g.y) / g.rect.height;
      if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 3) return;
      g.moved = true;
      let box = moveBox(g.box, dx, dy);
      let lines: Guides = { x: [], y: [] };
      const l = d.design.layers.find((x) => x.id === g.id);
      if (snap && !l?.rotate) ({ box, guides: lines } = snapMove(box, snapTargets(d.design, g.id, s), SNAP_PX / g.rect.width, SNAP_PX / g.rect.height));
      setGuides(lines);
      const next = clampBox(box);
      d.patch(g.id, (x) => ({ ...x, x: next.x, y: next.y }), g.key);
    } else if (g.mode === "resize") {
      const l = d.design.layers.find((x) => x.id === g.id);
      if (!l) return;
      const dx = (e.clientX - g.x) / g.rect.width;
      const dy = (e.clientY - g.y) / g.rect.height;
      const corner = g.handle.length === 2;
      // Текст за угол — вместе с кеглем; круглое фото — без искажения; Shift — пропорционально.
      const keep = e.shiftKey || (corner && l.kind === "text") || (l.kind === "image" && l.mask === "circle") || (corner && l.kind === "decor");
      let box = resizeBox(g.box, g.rotate, g.handle, dx, dy, b, keep);
      let lines: Guides = { x: [], y: [] };
      if (snap && !g.rotate && !keep) ({ box, guides: lines } = snapResize(box, g.handle, snapTargets(d.design, g.id, s), SNAP_PX / g.rect.width, SNAP_PX / g.rect.height));
      setGuides(lines);
      const next = clampBox(box);
      d.patch(
        g.id,
        (x) => {
          if (x.kind === "text" && corner && g.size) {
            const size = Math.min(0.4, Math.max(0.012, Math.round(g.size * (next.w / g.box.w) * 10000) / 10000));
            return { ...x, ...next, style: { ...x.style, size } };
          }
          return { ...x, ...next };
        },
        g.key,
      );
    } else if (g.mode === "rotate") {
      const angle = rotateAngle(g.rotate, g.from, pointerAngle(g.cx, g.cy, e.clientX, e.clientY), e.shiftKey);
      d.patch(g.id, (x) => ({ ...x, rotate: angle || undefined }), g.key);
    } else if (g.mode === "pan") {
      const frame = panFrame(g.frame, g.boxPx, g.img, e.clientX - g.x, e.clientY - g.y);
      d.patch(g.id, (x) => ({ ...(x as ImageLayer), frame }), g.key);
    }
  };

  /** Слушатели текущего жеста на window — снимаются в конце жеста и при уходе со страницы. */
  const listeners = useRef<{ move: (e: PointerEvent) => void; up: () => void } | null>(null);
  const detach = () => {
    const h = listeners.current;
    if (!h) return;
    window.removeEventListener("pointermove", h.move);
    window.removeEventListener("pointerup", h.up);
    window.removeEventListener("pointercancel", h.up);
    listeners.current = null;
  };
  const end = () => {
    detach();
    gesture.current = null;
    setGuides({ x: [], y: [] });
  };

  const begin = (g: Gesture, e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    detach();
    gesture.current = g;
    listeners.current = { move: onMove, up: end };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  // Снять слушатели жеста при уходе со страницы.
  useEffect(() => detach, []);

  const rect = () => boardRef.current!.getBoundingClientRect();
  /** Ключ жеста: все правки одного жеста — один шаг отмены. */
  const seq = useRef(0);
  const key = (kind: string, id: string) => `g:${kind}:${id}:${++seq.current}`;

  const startMove = (e: ReactPointerEvent, l: CoverLayer) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (editing && editing !== l.id) setEditing(null);
    if (cropping && cropping !== l.id) setCropping(null);
    dz.select(l.id);
    if (!editable || l.locked || editing === l.id) return;
    const r = rect();
    if (cropping === l.id && l.kind === "image") {
      const img = imageDims(l);
      if (!img) return;
      begin({ mode: "pan", id: l.id, x: e.clientX, y: e.clientY, frame: normalizeFrame(l.frame), boxPx: { w: l.w * r.width, h: l.h * r.height }, img, key: key("pan", l.id) }, e);
      return;
    }
    begin({ mode: "move", id: l.id, x: e.clientX, y: e.clientY, rect: r, box: { x: l.x, y: l.y, w: l.w, h: l.h }, key: key("move", l.id), moved: false }, e);
  };

  const startResize = (e: ReactPointerEvent, l: CoverLayer, handle: Handle) => {
    if (e.button !== 0) return;
    begin({ mode: "resize", id: l.id, x: e.clientX, y: e.clientY, rect: rect(), box: { x: l.x, y: l.y, w: l.w, h: l.h }, rotate: l.rotate ?? 0, handle, size: l.kind === "text" ? l.style.size : undefined, key: key("size", l.id) }, e);
  };

  const startRotate = (e: ReactPointerEvent, l: CoverLayer) => {
    if (e.button !== 0) return;
    const r = rect();
    const cx = r.left + (l.x + l.w / 2) * r.width;
    const cy = r.top + (l.y + l.h / 2) * r.height;
    begin({ mode: "rotate", id: l.id, rect: r, cx, cy, from: pointerAngle(cx, cy, e.clientX, e.clientY), rotate: l.rotate ?? 0, key: key("rot", l.id) }, e);
  };

  const openLayer = (l: CoverLayer) => {
    if (!editable || l.locked) return;
    if (l.kind === "text") setEditing(l.id);
    if (l.kind === "image" && (l.photoId || l.stock)) setCropping(l.id);
  };

  // ─── слой: правка текста на обложке ─────────────────────────────────────

  const editLayer = editing ? design.layers.find((l): l is TextLayer => l.id === editing && l.kind === "text") : undefined;

  // ─── отрисовка ──────────────────────────────────────────────────────────

  const finishEdit = (l: TextLayer, value: string) => {
    setEditing(null);
    if (l.bind) {
      if (value !== texts[l.bind]) onBookText(l.bind, value);
    } else if (value !== l.text) dz.patch(l.id, (x) => ({ ...(x as TextLayer), text: value }));
  };
  const frameStyle = (l: CoverLayer): CSSProperties => ({ position: "absolute", left: pct(l.x), top: pct(l.y), width: pct(l.w), height: pct(l.h), transform: l.rotate ? `rotate(${l.rotate}deg)` : undefined });

  const overlay = (
    <>
      {/* Всё вне крышки — загиб: приглушаем, край крышки — линией. */}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ boxShadow: "0 0 0 100vmax rgba(250,247,242,.55)", outline: "1px solid rgba(30,25,22,.35)" }} />
      <div aria-hidden className="pointer-events-none absolute left-0 -translate-y-full pb-0.5 text-[10px] tracking-wide text-ink/60 uppercase">
        {labels.wrap}
      </div>
      {showGrid ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: "linear-gradient(to right, rgba(30,25,22,.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(30,25,22,.12) 1px, transparent 1px)", backgroundSize: "10% 10%" }}
        />
      ) : null}
      {showSafe ? <div aria-hidden className="pointer-events-none absolute border border-dashed border-sky-500/70" style={{ left: pct(safe.x), top: pct(safe.y), width: pct(safe.w), height: pct(safe.h) }} /> : null}
      {guides.x.map((x, i) => (
        <div key={`gx${i}`} aria-hidden className="pointer-events-none absolute w-px bg-fuchsia-500" style={{ left: pct(x), top: "-6%", bottom: "-6%" }} />
      ))}
      {guides.y.map((y, i) => (
        <div key={`gy${i}`} aria-hidden className="pointer-events-none absolute h-px bg-fuchsia-500" style={{ top: pct(y), left: "-6%", right: "-6%" }} />
      ))}
      {cropping && croppingLayer?.kind === "image" ? <CropGhost layer={croppingLayer} dims={imageDims(croppingLayer)} board={board} /> : null}
      {selectedLayer && !selectedLayer.hidden && editing !== selectedLayer.id ? (
        <div className="pointer-events-none absolute" style={frameStyle(selectedLayer)}>
          <div className={cn("absolute inset-0 outline outline-[1.5px]", cropping === selectedLayer.id ? "outline-sky-500" : "outline-wine")} />
          {selectedLayer.locked ? (
            <span className="absolute -top-2.5 -right-2.5 flex size-5 items-center justify-center rounded-full bg-ink text-white">
              <Lock className="size-3" />
            </span>
          ) : editable && cropping !== selectedLayer.id ? (
            <>
              {HANDLES.map((h) => (
                <button
                  key={h}
                  type="button"
                  aria-label={`${labels.resize} (${h})`}
                  tabIndex={-1}
                  onPointerDown={(e) => startResize(e, selectedLayer, h)}
                  className="pointer-events-auto absolute size-3 -translate-x-1/2 -translate-y-1/2 touch-none rounded-[3px] border-[1.5px] border-wine bg-white shadow-sm max-lg:size-4"
                  style={{ ...handlePos[h], cursor: cursorOf[h] }}
                />
              ))}
              {/* Ручка поворота — над слоем, а у слоя под верхним краем обложки — под ним (иначе её не достать). */}
              <span aria-hidden className="absolute left-1/2 h-5 w-px -translate-x-1/2 bg-wine" style={selectedLayer.y < 0.1 ? { bottom: -20 } : { top: -20 }} />
              <button
                type="button"
                aria-label={labels.rotate}
                tabIndex={-1}
                onPointerDown={(e) => startRotate(e, selectedLayer)}
                className="pointer-events-auto absolute left-1/2 flex size-6 -translate-x-1/2 touch-none items-center justify-center rounded-full border-[1.5px] border-wine bg-white text-wine shadow-sm"
                style={{ ...(selectedLayer.y < 0.1 ? { bottom: -42 } : { top: -42 }), cursor: "grab" }}
              >
                <RotateCw className="size-3.5" />
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {editLayer ? <TextEditor key={editLayer.id} layer={editLayer} texts={texts} placeholder={labels.placeholders[editLayer.bind ?? "text"]} ariaLabel={labels.editText} onDone={(value) => finishEdit(editLayer, value)} onCancel={() => setEditing(null)} /> : null}
    </>
  );



  return (
    <div
      role="application"
      aria-label={labels.aria}
      className="relative select-none"
      onPointerDown={() => {
        // Щелчок мимо слоёв — снять выделение и выйти из правки.
        if (editing) setEditing(null);
        if (cropping) setCropping(null);
        dz.select(null);
      }}
    >
      <DesignedCover
        template={template}
        format={format.id}
        design={design}
        texts={texts}
        photos={photos}
        wrap={8}
        uid="designer"
        boardRef={boardRef}
        className="rounded-[3px] shadow-book"
        overlay={overlay}
        placeholders={{
          text: (l) => labels.placeholders[l.bind ?? "text"],
          image: (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-black/10 text-[3cqw] text-ink/60">
              <ImagePlus className="size-[6cqw]" />
              {labels.image}
            </div>
          ),
        }}
        layerProps={(l) => ({
          "data-layer": l.id,
          className: cn("touch-none", !l.locked && editable && "hover:outline hover:outline-1 hover:outline-wine/40"),
          style: {
            pointerEvents: l.locked || l.hidden ? "none" : "auto",
            cursor: !editable || l.locked ? "default" : cropping === l.id ? "grab" : "move",
            visibility: editing === l.id ? "hidden" : undefined,
          },
          onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => startMove(e, l),
          onDoubleClick: () => openLayer(l),
        })}
      />
    </div>
  );
}

/** Снимок целиком полупрозрачно поверх рамки — видно, что срезано, пока двигаешь кадр. */
function CropGhost({ layer, dims, board }: { layer: ImageLayer; dims: { width: number; height: number } | null; board: { w: number; h: number } }) {
  if (!dims) return null;
  const wMm = layer.w * board.w;
  const hMm = layer.h * board.h;
  const r = framedImageRect({ x: 0, y: 0, w: wMm, h: hMm }, dims, normalizeFrame(layer.frame));
  const src = layer.photoId ? photoUrl(layer.photoId, "view") : layer.stock ? coverPhotoUrl(layer.stock, 1600) : null;
  if (!src) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute" style={{ left: pct(layer.x), top: pct(layer.y), width: pct(layer.w), height: pct(layer.h), transform: layer.rotate ? `rotate(${layer.rotate}deg)` : undefined }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- снимок книги или коллекции */}
      <img
        src={src}
        alt=""
        className="absolute max-w-none opacity-30"
        style={{ left: `${(r.x / wMm) * 100}%`, top: `${(r.y / hMm) * 100}%`, width: `${(r.w / wMm) * 100}%`, height: `${(r.h / hMm) * 100}%` }}
      />
      <div className="absolute inset-0 outline outline-2 outline-sky-500" />
    </div>
  );
}

/** Правка надписи прямо на обложке: тот же набор, что у слоя; Esc — отмена, щелчок мимо — сохранить. */
function TextEditor({ layer, texts, placeholder, ariaLabel, onDone, onCancel }: { layer: TextLayer; texts: CoverTexts; placeholder: string; ariaLabel: string; onDone: (value: string) => void; onCancel: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const initial = layerText(layer, texts);
  const cancelled = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerText = initial;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- текст ставится один раз при открытии
  const s = layer.style;
  const plate = s.plate;
  return (
    <div
      className="absolute"
      style={{ left: pct(layer.x), top: pct(layer.y), width: pct(layer.w), height: pct(layer.h), transform: layer.rotate ? `rotate(${layer.rotate}deg)` : undefined, opacity: layer.opacity ?? 1 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="absolute inset-0 flex flex-col outline-2 outline-sky-500 outline-dashed"
        style={{
          justifyContent: s.valign === "top" ? "flex-start" : s.valign === "bottom" ? "flex-end" : "center",
          background: plate ? hexAlpha(plate.color, plate.opacity) : undefined,
          borderRadius: plate?.radius ? `${plate.radius * 100}cqw` : undefined,
          padding: plate?.pad ? `${plate.pad * s.size * 100}cqw` : undefined,
        }}
      >
        <div
          ref={ref}
          role="textbox"
          aria-multiline
          aria-label={ariaLabel}
          aria-placeholder={placeholder}
          contentEditable="plaintext-only"
          suppressContentEditableWarning
          className="min-h-[1em] cursor-text outline-none"
          style={{ ...textCss(s), userSelect: "text" }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") {
              cancelled.current = true;
              onCancel();
            }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) (e.target as HTMLElement).blur();
          }}
          onBlur={(e) => {
            if (cancelled.current) return;
            onDone((e.target as HTMLElement).innerText.replace(/\n$/, "").slice(0, 300));
          }}
        />
      </div>
    </div>
  );
}
