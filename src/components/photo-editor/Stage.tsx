"use client";

/**
 * Сцена редактора фото: снимок с правкой на холсте и всё, что делают руками, — выбрать слой, двигать его пальцем,
 * двумя пальцами увеличить и повернуть, тянуть за уголки и за ручку поворота, рисовать, двигать рамку кадра.
 * Холст рисует превью теми же функциями, что и готовый файл (render.ts), поэтому в книге будет то же самое.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Copy, RotateCw, Trash2, Type } from "lucide-react";
import { touchesPixels, effectiveAdjust } from "@/lib/photo-edit/color";
import { centeredCrop, clampRect, SCALE_MAX, SCALE_MIN, turnedSize, type Layer, type PhotoEdit, type Rect } from "@/lib/photo-edit/doc";
import { colorCanvas, cropPixels, drawOverlays, geometryCanvas, hitLayer, layerBox, loadFonts, makeCanvas, releaseCanvas, strokePath } from "@/lib/photo-edit/render";
import { cn } from "@/lib/class-names";
import { newStroke, thinPoints } from "./presets";

export type Tool = "text" | "shapes" | "draw" | "crop" | "adjust" | "filters";

export interface DrawStyle {
  color: string;
  width: number;
  brush: "pen" | "marker";
}

interface History {
  set: (next: PhotoEdit | ((d: PhotoEdit) => PhotoEdit), key?: string) => void;
  begin: () => void;
  end: () => void;
  current: () => PhotoEdit;
}

let measurer: CanvasRenderingContext2D | null = null;
/** Холст для замеров надписей (рамка выбора, попадание пальцем). */
export const measureCtx = () => (measurer ??= document.createElement("canvas").getContext("2d")!);

/** Поля «опасной зоны» у края: при печати под обрез край снимка может срезаться. */
export const EDGE = 0.04;

/** Слой заходит в поля у края готовой картинки W×H. */
export function nearEdge(l: Layer, W: number, H: number) {
  const b = layerBox(measureCtx(), l, Math.min(W, H));
  const a = (l.rotation * Math.PI) / 180;
  const hw = (Math.abs(b.w * Math.cos(a)) + Math.abs(b.h * Math.sin(a))) / 2;
  const hh = (Math.abs(b.w * Math.sin(a)) + Math.abs(b.h * Math.cos(a))) / 2;
  const cx = l.x * W;
  const cy = l.y * H;
  const m = EDGE * Math.min(W, H);
  return cx - hw < m || cy - hh < m || cx + hw > W - m || cy + hh > H - m;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const SNAP_PX = 7;
const snapAngle = (deg: number) => {
  for (const t of [-180, -135, -90, -45, 0, 45, 90, 135, 180]) if (Math.abs(deg - t) < 3.5) return t === -180 ? 180 : t;
  return Math.round(deg * 10) / 10;
};
const normDeg = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

type Gesture =
  | {
      kind: "move";
      id: string;
      px: number;
      py: number;
      x0: number;
      y0: number;
      moved: boolean;
    }
  | {
      kind: "pinch";
      id: string;
      d0: number;
      a0: number;
      m0: { x: number; y: number };
      s0: number;
      r0: number;
      x0: number;
      y0: number;
    }
  | {
      kind: "scale";
      id: string;
      cx: number;
      cy: number;
      d0: number;
      s0: number;
    }
  | {
      kind: "rotate";
      id: string;
      cx: number;
      cy: number;
      a0: number;
      r0: number;
    }
  | { kind: "draw"; pts: number[] }
  | { kind: "tap" };

export function Stage({
  img,
  iw,
  ih,
  doc,
  tool,
  selectedId,
  onSelect,
  history,
  drawStyle,
  compare,
  onEditText,
  labels,
}: {
  img: HTMLImageElement;
  iw: number;
  ih: number;
  doc: PhotoEdit;
  tool: Tool;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  history: History;
  drawStyle: DrawStyle;
  compare: boolean;
  onEditText: (id: string) => void;
  labels: {
    duplicate: string;
    delete: string;
    editText: string;
    rotate: string;
    size: string;
  };
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [fontsTick, setFontsTick] = useState(0);
  const [guides, setGuides] = useState<{
    v: boolean;
    h: boolean;
    edges: boolean;
  }>({ v: false, h: false, edges: false });
  const [live, setLive] = useState<number[] | null>(null);
  const [rotating, setRotating] = useState<number | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastTap = useRef<{ id: string; t: number } | null>(null);
  const g = doc.geometry;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setArea({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Копия снимка для превью: не больше экрана в настоящих пикселях (на телефоне ~1200–1600 px) — быстрая правка цвета.
  const previewMax = useMemo(() => (typeof window === "undefined" ? 1400 : clamp(Math.max(window.screen.width, window.screen.height) * Math.min(2, window.devicePixelRatio || 1), 900, 1600)), []);
  const geo = useMemo(() => geometryCanvas(img, iw, ih, { turns: g.turns, flip: g.flip, straighten: g.straighten }, previewMax), [img, iw, ih, g.turns, g.flip, g.straighten, previewMax]);
  // Прежнюю копию освобождаем, когда появилась новая (не при размонтировании эффекта: в StrictMode он
  // перезапускается, а копия из useMemo остаётся той же).
  const prevGeo = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const old = prevGeo.current;
    prevGeo.current = geo;
    if (old && old !== geo) releaseCanvas(old);
  }, [geo]);

  // Свет и цвет — в отдельном холсте, не чаще кадра экрана (ползунок шлёт десятки событий в секунду).
  const colorKey = JSON.stringify([doc.adjust, doc.levels, doc.filter]);
  const colored = useRef<HTMLCanvasElement | null>(null);
  const [colorTick, setColorTick] = useState(0);
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const e = JSON.parse(colorKey) as [PhotoEdit["adjust"], PhotoEdit["levels"], PhotoEdit["filter"]];
      const needs = touchesPixels(effectiveAdjust(e[0], e[2]), e[1], e[2]);
      if (!needs) {
        colored.current = geo;
      } else {
        let c = colored.current;
        if (!c || c === geo || c.width !== geo.width || c.height !== geo.height) c = makeCanvas(geo.width, geo.height);
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.drawImage(geo, 0, 0);
        colorCanvas(c, { adjust: e[0], levels: e[1], filter: e[2] });
        colored.current = c;
      }
      setColorTick((n) => n + 1);
    });
    return () => cancelAnimationFrame(raf);
  }, [geo, colorKey]);

  // Шрифты надписей: холст не ждёт их сам — дорисуем, когда загрузятся.
  const fontsKey = doc.layers.map((l) => (l.type === "text" ? `${l.font}:${l.weight}:${l.italic}` : "")).join("|");
  const currentDoc = history.current;
  useEffect(() => {
    let alive = true;
    void loadFonts(currentDoc().layers).then(() => alive && setFontsTick((n) => n + 1));
    return () => {
      alive = false;
    };
  }, [fontsKey, currentDoc]);

  // Размер на экране: в «Кадре» — весь снимок, иначе — готовая картинка.
  const cropping = tool === "crop";
  const src = cropping
    ? { w: geo.width, h: geo.height }
    : (() => {
        const r = cropPixels(geo, g);
        return { w: r.w, h: r.h };
      })();
  const pad = cropping ? 28 : 12;
  const fit = Math.min((area.w - pad * 2) / src.w, (area.h - pad * 2) / src.h);
  const dw = Math.max(1, Math.floor(src.w * fit));
  const dh = Math.max(1, Math.floor(src.h * fit));
  const dpr = typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1);
  const ready = area.w > 0 && area.h > 0;

  useEffect(() => {
    const c = canvas.current;
    const source = colored.current;
    // Копия снимка уже освобождена (сменился поворот) — дождёмся новой.
    if (!c || !source || !source.width || !ready) return;
    const W = Math.round(dw * dpr);
    const H = Math.round(dh * dpr);
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, W, H);
    if (compare) {
      // «До»: исходный снимок целиком, по центру рамки.
      const k = Math.min(W / iw, H / ih);
      ctx.fillStyle = "#141110";
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img, (W - iw * k) / 2, (H - ih * k) / 2, iw * k, ih * k);
      return;
    }
    if (cropping) {
      ctx.drawImage(source, 0, 0, W, H);
      return;
    }
    const r = cropPixels(source, g);
    ctx.drawImage(source, r.x, r.y, r.w, r.h, 0, 0, W, H);
    drawOverlays(ctx, doc, W, H);
  }, [doc, g, colorTick, fontsTick, compare, cropping, dw, dh, dpr, ready, img, iw, ih]);

  const layer = selectedId ? doc.layers.find((l) => l.id === selectedId) : undefined;
  const unit = Math.min(dw, dh);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const patchLayer = useCallback(
    (id: string, patch: Partial<Layer>) =>
      history.set((d) => ({
        ...d,
        layers: d.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)),
      })),
    [history],
  );

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (compare || cropping) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === "draw") {
      if (pointers.current.size > 1) return;
      gesture.current = { kind: "draw", pts: [p.x / unit, p.y / unit] };
      setLive([p.x / unit, p.y / unit]);
      return;
    }
    const cur = history.current();
    if (pointers.current.size === 2) {
      // Второй палец: щипок по выбранному слою (или по тому, который начали двигать).
      const id = gesture.current && "id" in gesture.current ? gesture.current.id : selectedId;
      const l = id ? cur.layers.find((x) => x.id === id) : undefined;
      if (!l) return;
      const [a, b] = [...pointers.current.values()];
      if (gesture.current?.kind !== "move") history.begin();
      gesture.current = {
        kind: "pinch",
        id: l.id,
        d0: Math.hypot(b.x - a.x, b.y - a.y),
        a0: Math.atan2(b.y - a.y, b.x - a.x),
        m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        s0: l.scale,
        r0: l.rotation,
        x0: l.x,
        y0: l.y,
      };
      onSelect(l.id);
      return;
    }
    const hit = hitLayer(measureCtx(), cur.layers, p.x, p.y, dw, dh, e.pointerType === "touch" ? 12 : 4);
    if (!hit) {
      gesture.current = { kind: "tap" };
      return;
    }
    const now = e.timeStamp;
    if (hit.type === "text" && lastTap.current?.id === hit.id && now - lastTap.current.t < 380) onEditText(hit.id);
    lastTap.current = { id: hit.id, t: now };
    onSelect(hit.id);
    history.begin();
    gesture.current = {
      kind: "move",
      id: hit.id,
      px: p.x,
      py: p.y,
      x0: hit.x,
      y0: hit.y,
      moved: false,
    };
  };

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const gs = gesture.current;
    if (!gs) return;
    if (gs.kind === "draw") {
      gs.pts.push(p.x / unit, p.y / unit);
      setLive([...gs.pts]);
      return;
    }
    if (gs.kind === "move") {
      let x = gs.x0 + (p.x - gs.px) / dw;
      let y = gs.y0 + (p.y - gs.py) / dh;
      if (!gs.moved && Math.hypot(p.x - gs.px, p.y - gs.py) < 3) return;
      gs.moved = true;
      const v = Math.abs(x * dw - dw / 2) < SNAP_PX;
      const h = Math.abs(y * dh - dh / 2) < SNAP_PX;
      if (v) x = 0.5;
      if (h) y = 0.5;
      setGuides({ v, h, edges: true });
      patchLayer(gs.id, { x: clamp(x, -0.2, 1.2), y: clamp(y, -0.2, 1.2) });
      return;
    }
    if (gs.kind === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const rotation = snapAngle(normDeg(gs.r0 + ((ang - gs.a0) * 180) / Math.PI));
      setGuides({ v: false, h: false, edges: true });
      setRotating(rotation);
      patchLayer(gs.id, {
        scale: clamp((gs.s0 * d) / Math.max(1, gs.d0), SCALE_MIN, SCALE_MAX),
        rotation,
        x: clamp(gs.x0 + (m.x - gs.m0.x) / dw, -0.2, 1.2),
        y: clamp(gs.y0 + (m.y - gs.m0.y) / dh, -0.2, 1.2),
      });
    }
  };

  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    const gs = gesture.current;
    if (!gs) return;
    if (gs.kind === "pinch" && pointers.current.size === 1) {
      // Один палец остался — продолжаем двигать слой им.
      const [rest] = [...pointers.current.values()];
      const l = history.current().layers.find((x) => x.id === gs.id);
      if (l)
        gesture.current = {
          kind: "move",
          id: l.id,
          px: rest.x,
          py: rest.y,
          x0: l.x,
          y0: l.y,
          moved: true,
        };
      setRotating(null);
      return;
    }
    if (pointers.current.size) return;
    gesture.current = null;
    setGuides({ v: false, h: false, edges: false });
    setRotating(null);
    if (gs.kind === "tap") onSelect(null);
    else if (gs.kind === "draw") {
      setLive(null);
      const pts = thinPoints(gs.pts, 0.0025, 1500);
      const W = dw / unit;
      const H = dh / unit;
      history.set((d) => ({
        ...d,
        layers: [...d.layers, newStroke(pts, drawStyle, W, H)],
      }));
    } else history.end();
  };

  /** Уголок (размер) или ручка поворота выбранного слоя. */
  const startHandle = (e: ReactPointerEvent<HTMLElement>) => {
    const kind = e.currentTarget.dataset.handle as "scale" | "rotate";
    if (!layer) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = canvas.current!.getBoundingClientRect();
    const cx = r.left + layer.x * dw;
    const cy = r.top + layer.y * dh;
    history.begin();
    gesture.current =
      kind === "scale"
        ? {
            kind: "scale",
            id: layer.id,
            cx,
            cy,
            d0: Math.max(1, Math.hypot(e.clientX - cx, e.clientY - cy)),
            s0: layer.scale,
          }
        : {
            kind: "rotate",
            id: layer.id,
            cx,
            cy,
            a0: Math.atan2(e.clientY - cy, e.clientX - cx),
            r0: layer.rotation,
          };
  };
  const moveHandle = (e: ReactPointerEvent<HTMLElement>) => {
    const gs = gesture.current;
    if (!gs || (gs.kind !== "scale" && gs.kind !== "rotate")) return;
    e.stopPropagation();
    setGuides({ v: false, h: false, edges: true });
    if (gs.kind === "scale")
      patchLayer(gs.id, {
        scale: clamp((gs.s0 * Math.hypot(e.clientX - gs.cx, e.clientY - gs.cy)) / gs.d0, SCALE_MIN, SCALE_MAX),
      });
    else {
      const rotation = snapAngle(normDeg(gs.r0 + ((Math.atan2(e.clientY - gs.cy, e.clientX - gs.cx) - gs.a0) * 180) / Math.PI));
      setRotating(rotation);
      patchLayer(gs.id, { rotation });
    }
  };
  const endHandle = (e: ReactPointerEvent<HTMLElement>) => {
    const gs = gesture.current;
    if (!gs || (gs.kind !== "scale" && gs.kind !== "rotate")) return;
    e.stopPropagation();
    gesture.current = null;
    setGuides({ v: false, h: false, edges: false });
    setRotating(null);
    history.end();
  };

  const duplicate = (l: Layer) => {
    const copy = {
      ...l,
      id: Math.random().toString(36).slice(2, 10),
      x: clamp(l.x + 0.04, 0, 1),
      y: clamp(l.y + 0.04, 0, 1),
    } as Layer;
    history.set((d) => ({ ...d, layers: [...d.layers, copy] }));
    onSelect(copy.id);
  };
  const remove = (l: Layer) => {
    history.set((d) => ({
      ...d,
      layers: d.layers.filter((x) => x.id !== l.id),
    }));
    onSelect(null);
  };

  // Рамка выбранного слоя (на экране) и место для панели действий над ней.
  const sel = layer && !cropping && !compare && tool !== "draw" ? selection(layer, dw, dh, unit) : null;

  return (
    <div ref={box} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden select-none">
      {ready ? (
        <div className="relative" style={{ width: dw, height: dh }}>
          <canvas ref={canvas} className="block shadow-[0_10px_40px_-10px_rgb(0_0_0/0.8)]" style={{ width: dw, height: dh }} />
          {cropping ? (
            <CropBox doc={doc} geo={{ w: geo.width, h: geo.height }} dw={dw} dh={dh} history={history} />
          ) : (
            <div
              className={cn("absolute inset-0 touch-none", tool === "draw" ? "cursor-crosshair" : "cursor-default")}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            >
              {guides.edges ? <div className="pointer-events-none absolute border border-dashed border-white/35" style={{ inset: EDGE * unit }} /> : null}
              {guides.v ? <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-[#e9b8bf]" /> : null}
              {guides.h ? <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-[#e9b8bf]" /> : null}
              {live && live.length >= 2 ? <LiveStroke pts={live} unit={unit} style={drawStyle} dw={dw} dh={dh} /> : null}
            </div>
          )}
          {sel && layer ? (
            <>
              <div
                className="pointer-events-none absolute rounded-[3px] outline-[1.5px] outline-white outline-solid [box-shadow:0_0_0_1px_rgb(0_0_0/0.35)]"
                style={{
                  left: sel.cx - sel.w / 2,
                  top: sel.cy - sel.h / 2,
                  width: sel.w,
                  height: sel.h,
                  transform: `rotate(${layer.rotation}deg)`,
                }}
              >
                {(["nw", "ne", "sw", "se"] as const).map((c) => (
                  <span
                    key={c}
                    role="button"
                    aria-label={labels.size}
                    data-handle="scale"
                    onPointerDown={startHandle}
                    onPointerMove={moveHandle}
                    onPointerUp={endHandle}
                    onPointerCancel={endHandle}
                    className={cn(
                      "pointer-events-auto absolute flex size-11 touch-none items-center justify-center",
                      c[0] === "n" ? "-top-[22px]" : "-bottom-[22px]",
                      c[1] === "w" ? "-left-[22px]" : "-right-[22px]",
                      c === "nw" || c === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize",
                    )}
                  >
                    <span className="size-3.5 rounded-full border-2 border-[#7a1f2b] bg-white shadow" />
                  </span>
                ))}
                <span
                  role="button"
                  aria-label={labels.rotate}
                  data-handle="rotate"
                  onPointerDown={startHandle}
                  onPointerMove={moveHandle}
                  onPointerUp={endHandle}
                  onPointerCancel={endHandle}
                  className="pointer-events-auto absolute -bottom-[54px] left-1/2 flex size-11 -translate-x-1/2 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
                >
                  <span className="flex size-7 items-center justify-center rounded-full bg-white text-[#7a1f2b] shadow">
                    <RotateCw className="size-3.5" />
                  </span>
                </span>
              </div>
              {rotating !== null ? (
                <div
                  className="pointer-events-none absolute rounded-full bg-black/70 px-2 py-0.5 text-xs text-white tabular-nums"
                  style={{
                    left: sel.cx,
                    top: sel.cy,
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  {Math.round(rotating)}°
                </div>
              ) : null}
              {!guides.edges ? (
                <div
                  className="absolute z-10 flex -translate-x-1/2 gap-0.5 rounded-full bg-[#1e1a17]/95 p-1 shadow-lg ring-1 ring-white/10"
                  style={{
                    left: clamp(sel.cx, 70, dw - 70),
                    top: sel.top > 56 ? sel.top - 52 : Math.min(dh - 48, sel.bottom + 62),
                  }}
                >
                  {layer.type === "text" ? <MiniButton label={labels.editText} onClick={() => onEditText(layer.id)} icon={<Type className="size-4" />} /> : null}
                  <MiniButton label={labels.duplicate} onClick={() => duplicate(layer)} icon={<Copy className="size-4" />} />
                  <MiniButton label={labels.delete} onClick={() => remove(layer)} icon={<Trash2 className="size-4" />} danger />
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MiniButton({ label, onClick, icon, danger }: { label: string; onClick: () => void; icon: React.ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      className={cn("flex size-10 items-center justify-center rounded-full transition", danger ? "text-[#ff8f8f] hover:bg-[#E5484D]/20" : "text-white hover:bg-white/15")}
    >
      {icon}
    </button>
  );
}

/** Рамка слоя на экране: центр, размер без поворота и края повёрнутой рамки по вертикали. */
function selection(l: Layer, dw: number, dh: number, unit: number) {
  const b = layerBox(measureCtx(), l, unit);
  const w = Math.max(b.w, 24);
  const h = Math.max(b.h, 24);
  const a = (l.rotation * Math.PI) / 180;
  const half = (Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a))) / 2;
  const cx = l.x * dw;
  const cy = l.y * dh;
  return { cx, cy, w, h, top: cy - half, bottom: cy + half };
}

/** Линия, которую рисуют сейчас, — поверх холста, пока палец не отпустили. */
function LiveStroke({ pts, unit, style, dw, dh }: { pts: number[]; unit: number; style: DrawStyle; dw: number; dh: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(dw * dpr);
    c.height = Math.round(dh * dpr);
    const ctx = c.getContext("2d")!;
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.width * unit * dpr;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = style.brush === "marker" ? 0.5 : 1;
    strokePath(ctx, pts, unit * dpr);
    ctx.stroke();
  }, [pts, unit, style, dw, dh]);
  return <canvas ref={ref} className="pointer-events-none absolute inset-0" style={{ width: dw, height: dh }} />;
}

type CropHandle = "move" | "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

/**
 * Рамка кадра поверх всего снимка: тянуть за углы и стороны, двигать целиком. При выбранной пропорции рамка её
 * держит. Затемнение вокруг и сетка третей — пока тянут.
 */
const aspectOf = (a: string) => {
  const m = /^(\d+):(\d+)$/.exec(a);
  return m ? Number(m[1]) / Number(m[2]) : null;
};

function CropBox({ doc, geo, dw, dh, history }: { doc: PhotoEdit; geo: { w: number; h: number }; dw: number; dh: number; history: History }) {
  const g = doc.geometry;
  const rect: Rect = g.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const drag = useRef<{
    handle: CropHandle;
    px: number;
    py: number;
    r: { x: number; y: number; w: number; h: number };
  } | null>(null);
  const [active, setActive] = useState(false);
  // Пропорция рамки в пикселях снимка (рамка на экране — в том же масштабе по обеим осям).
  const ratio = g.aspect === "free" ? null : g.aspect === "original" ? geo.w / geo.h : aspectOf(g.aspect);
  const px = { x: rect.x * dw, y: rect.y * dh, w: rect.w * dw, h: rect.h * dh };
  const MIN = 48;

  const start = (e: ReactPointerEvent<HTMLElement>) => {
    const handle = e.currentTarget.dataset.handle as CropHandle;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { handle, px: e.clientX, py: e.clientY, r: px };
    history.begin();
    setActive(true);
  };
  const move = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    let { x, y, w, h } = d.r;
    if (d.handle === "move") {
      x = clamp(x + dx, 0, dw - w);
      y = clamp(y + dy, 0, dh - h);
    } else {
      let x1 = x + w;
      let y1 = y + h;
      if (d.handle.includes("w")) x = clamp(x + dx, 0, x1 - MIN);
      if (d.handle.includes("e")) x1 = clamp(x1 + dx, x + MIN, dw);
      if (d.handle.includes("n")) y = clamp(y + dy, 0, y1 - MIN);
      if (d.handle.includes("s")) y1 = clamp(y1 + dy, y + MIN, dh);
      w = x1 - x;
      h = y1 - y;
      if (ratio) {
        // Держим пропорцию: по стороне, которую тянут; угол — по большему сдвигу.
        const byWidth = d.handle === "e" || d.handle === "w" || (d.handle.length === 2 && Math.abs(dx) >= Math.abs(dy));
        if (byWidth) h = w / ratio;
        else w = h * ratio;
        const cx = d.r.x + d.r.w / 2;
        const cy = d.r.y + d.r.h / 2;
        if (d.handle === "n" || d.handle === "s") x = cx - w / 2;
        if (d.handle === "e" || d.handle === "w") y = cy - h / 2;
        if (d.handle.includes("n")) y = d.r.y + d.r.h - h;
        if (d.handle.includes("w")) x = d.r.x + d.r.w - w;
        // Не выходим за снимок: уменьшаем рамку, сохраняя пропорцию.
        const k = Math.min(1, w > 0 ? (x < 0 ? (w + x) / w : 1) : 1, x + w > dw ? (dw - x) / w : 1, y < 0 ? (h + y) / h : 1, y + h > dh ? (dh - y) / h : 1);
        if (k < 1) {
          const nw = w * k;
          const nh = h * k;
          if (d.handle.includes("w")) x += w - nw;
          if (d.handle.includes("n")) y += h - nh;
          w = nw;
          h = nh;
        }
        x = clamp(x, 0, dw - w);
        y = clamp(y, 0, dh - h);
      }
    }
    const next = clampRect({ x: x / dw, y: y / dh, w: w / dw, h: h / dh });
    const full = next.x <= 0.001 && next.y <= 0.001 && next.w >= 0.999 && next.h >= 0.999;
    history.set((doc) => ({
      ...doc,
      geometry: { ...doc.geometry, crop: full ? null : next },
    }));
  };
  const end = () => {
    if (!drag.current) return;
    drag.current = null;
    setActive(false);
    history.end();
  };
  const on = {
    onPointerDown: start,
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: end,
  };

  return (
    <div className="absolute inset-0 touch-none overflow-hidden">
      <div className="absolute cursor-move [box-shadow:0_0_0_9999px_rgb(10_8_7/0.62)]" style={{ left: px.x, top: px.y, width: px.w, height: px.h }} data-handle={"move"} {...on}>
        <div className="pointer-events-none absolute inset-0 outline-1 outline-white outline-solid" />
        <div className={cn("pointer-events-none absolute inset-0 transition-opacity", active ? "opacity-100" : "opacity-40")}>
          <div className="absolute inset-y-0 left-1/3 w-px bg-white/60" />
          <div className="absolute inset-y-0 left-2/3 w-px bg-white/60" />
          <div className="absolute inset-x-0 top-1/3 h-px bg-white/60" />
          <div className="absolute inset-x-0 top-2/3 h-px bg-white/60" />
        </div>
        {(["nw", "ne", "sw", "se"] as const).map((c) => (
          <span
            key={c}
            data-handle={c}
            {...on}
            className={cn(
              "absolute size-11",
              c[0] === "n" ? "-top-[22px]" : "-bottom-[22px]",
              c[1] === "w" ? "-left-[22px]" : "-right-[22px]",
              c === "nw" || c === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize",
            )}
          >
            <span
              className={cn(
                "absolute size-5 border-white",
                c[0] === "n" ? "top-[19px] border-t-[3px]" : "bottom-[19px] border-b-[3px]",
                c[1] === "w" ? "left-[19px] border-l-[3px]" : "right-[19px] border-r-[3px]",
              )}
            />
          </span>
        ))}
        {(["n", "s"] as const).map((c) => (
          <span key={c} data-handle={c} {...on} className={cn("absolute inset-x-6 h-11 cursor-ns-resize", c === "n" ? "-top-[22px]" : "-bottom-[22px]")}>
            <span className={cn("absolute left-1/2 h-[3px] w-6 -translate-x-1/2 rounded bg-white", c === "n" ? "top-[19px]" : "bottom-[19px]")} />
          </span>
        ))}
        {(["w", "e"] as const).map((c) => (
          <span key={c} data-handle={c} {...on} className={cn("absolute inset-y-6 w-11 cursor-ew-resize", c === "w" ? "-left-[22px]" : "-right-[22px]")}>
            <span className={cn("absolute top-1/2 h-6 w-[3px] -translate-y-1/2 rounded bg-white", c === "w" ? "left-[19px]" : "right-[19px]")} />
          </span>
        ))}
      </div>
    </div>
  );
}

/** Кадр под пропорцию, выбранную в панели «Кадр»: самый большой по центру; «Свободно» — рамка остаётся. */
export function cropForAspect(doc: PhotoEdit, aspect: string, iw: number, ih: number): PhotoEdit {
  const t = turnedSize(iw, ih, doc.geometry.turns);
  if (aspect === "free") return { ...doc, geometry: { ...doc.geometry, aspect } };
  const ratio = aspect === "original" ? t.w / t.h : (aspectOf(aspect) ?? t.w / t.h);
  const crop = aspect === "original" ? null : centeredCrop(ratio, t);
  return { ...doc, geometry: { ...doc.geometry, aspect, crop } };
}
