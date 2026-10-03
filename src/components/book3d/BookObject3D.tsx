"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { BookOpen, Minus, Pause, Play, Plus, RotateCcw } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { CoverText } from "@/components/cover/CoverPreview";
import { getCoverTemplate, renderCoverSvg } from "@/lib/book/covers";
import { cssFont } from "@/lib/book/fonts";
import { coverSpreadGeometry, getFormat, type Rect } from "@/lib/book/formats";
import {
  BOARD_MM,
  bookDims,
  clamp,
  faceLight,
  INITIAL_VIEW,
  modelExtent,
  shadeOpacity,
  shortestDelta,
  spineFontMm,
  TILT_LIMIT,
  VIEWS,
  ZOOM,
  type FaceId,
  type Orientation,
} from "@/lib/book/book-model";
import { cn } from "@/lib/utils";
import type { FlipbookData } from "./Flipbook3D";

/** Длина в миллиметрах модели → CSS: --u — пикселей на миллиметр, зависит от размера кадра и масштаба. */
const L = (mm: number) => `calc(${Math.round(mm * 1000) / 1000} * var(--u))`;

type Side = "front" | "back" | "left" | "right" | "top" | "bottom";
type FaceSpec = { shade: FaceId; node?: ReactNode; style?: CSSProperties };

/** Поворот грани и её сдвиг вдоль нормали: куб из шести плоскостей с общим центром. */
const SIDE: Record<Side, { rotate: string; size: (w: number, h: number, d: number) => [number, number]; push: (w: number, h: number, d: number) => number }> = {
  front: { rotate: "", size: (w, h) => [w, h], push: (_w, _h, d) => d / 2 },
  back: { rotate: "rotateY(180deg)", size: (w, h) => [w, h], push: (_w, _h, d) => d / 2 },
  right: { rotate: "rotateY(90deg)", size: (_w, h, d) => [d, h], push: (w) => w / 2 },
  left: { rotate: "rotateY(-90deg)", size: (_w, h, d) => [d, h], push: (w) => w / 2 },
  top: { rotate: "rotateX(90deg)", size: (w, _h, d) => [w, d], push: (_w, h) => h / 2 },
  bottom: { rotate: "rotateX(-90deg)", size: (w, _h, d) => [w, d], push: (_w, h) => h / 2 },
};

const hidden: CSSProperties = { backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" };

/** Параллелепипед w×h×d (мм) с центром в (x, y, z); грани без описания не рисуются (их не видно снаружи). */
function Cuboid({ w, h, d, at = [0, 0, 0], faces }: { w: number; h: number; d: number; at?: [number, number, number]; faces: Partial<Record<Side, FaceSpec>> }) {
  return (
    <div className="absolute top-0 left-0 size-0" style={{ transformStyle: "preserve-3d", transform: `translate3d(${L(at[0])}, ${L(at[1])}, ${L(at[2])})` }}>
      {(Object.keys(faces) as Side[]).map((side) => {
        const f = faces[side]!;
        const [fw, fh] = SIDE[side].size(w, h, d);
        // Грань сдвигается вдоль своей нормали на половину соответствующего измерения.
        const push = SIDE[side].push(w, h, d);
        return (
          <div
            key={side}
            className="absolute top-0 left-0 overflow-hidden"
            style={{ width: L(fw), height: L(fh), containerType: "inline-size", transform: `translate(-50%, -50%) ${SIDE[side].rotate} translateZ(${L(push)})`, ...hidden, ...f.style }}
          >
            {f.node}
            {/* Затемнение по освещению: прозрачность обновляется при каждом повороте */}
            <div aria-hidden data-shade={f.shade} className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: 0 }} />
          </div>
        );
      })}
    </div>
  );
}

const PAPER_LINES = (deg: number) => `repeating-linear-gradient(${deg}deg, #fbf7ef 0 1px, #e9e0d0 1px 2px)`;

/**
 * Обрезает развёртку обложки до нужной стороны, чтобы браузер растрировал только её.
 * Фильтры фактуры заданы как «100% области просмотра» — после обрезки это размер стороны, а не развёртки,
 * и фактура пропадает на куске справа и снизу, поэтому размер области фильтра задаётся явно.
 */
function cropSvg(svg: string, r: Rect, spread: { w: number; h: number }) {
  return svg
    .replace(/viewBox="[^"]*"/, `viewBox="${r.x} ${r.y} ${r.w} ${r.h}"`)
    .replace(/preserveAspectRatio="[^"]*"/, 'preserveAspectRatio="none"')
    .replace(/(<filter [^>]*?)width="100%" height="100%"/g, `$1width="${spread.w}" height="${spread.h}"`);
}
const svgUrl = (svg: string) => `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;

interface DragState {
  pointers: Map<number, { x: number; y: number }>;
  pinch: { dist: number; zoom: number } | null;
  last: { t: number; x: number; y: number } | null;
}

export function BookObject3D({ data, onOpenBook, className }: { data: FlipbookData; onOpenBook?: () => void; className?: string }) {
  const t = useMessages().books.preview;
  const m = t.model;
  const format = getFormat(data.formatId);
  const template = getCoverTemplate(data.cover.template);
  const { pageCount, backText, brand } = data.model;

  const dims = useMemo(() => bookDims(format, pageCount), [format, pageCount]);
  const extent = modelExtent(dims);

  // ── Арт обложки: лицо, оборот и корешок — отдельными обрезанными картинками ──
  const art = useMemo(() => {
    const g = coverSpreadGeometry(format, pageCount);
    const uid = `bo${template.id}${format.id}`;
    const flat = renderCoverSvg(template, g, { uid });
    const photo = template.requiresPhoto && data.cover.photoUrl ? renderCoverSvg(template, g, { uid: `${uid}p`, photoHref: data.cover.photoUrl }) : null;
    const { front, back, spine } = dims.rects;
    return {
      // Картинка-SVG не загружает чужие файлы, поэтому лицо с фото клиента встраивается как есть.
      frontInline: photo ? cropSvg(photo, front, dims.spread) : null,
      front: svgUrl(cropSvg(flat, front, dims.spread)),
      back: svgUrl(cropSvg(flat, back, dims.spread)),
      spine: svgUrl(cropSvg(flat, spine, dims.spread)),
    };
  }, [format, pageCount, template, data.cover.photoUrl, dims.rects, dims.spread]);

  // ── Состояние просмотра хранится вне React: каждый кадр обновляет стили напрямую ──
  const stage = useRef<HTMLDivElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const shadeEls = useRef<HTMLElement[]>([]);
  const view = useRef({ ...INITIAL_VIEW, zoom: 1 });
  const motion = useRef({
    vx: 0,
    vy: 0,
    dragging: false,
    auto: true,
    anim: null as null | { from: Orientation & { zoom: number }; to: Orientation & { zoom: number }; t0: number; dur: number },
    last: 0,
    raf: 0,
  });
  const drag = useRef<DragState>({ pointers: new Map(), pinch: null, last: null });
  const [auto, setAuto] = useState(true);
  const [active, setActive] = useState<string | null>("front");

  const apply = useCallback(() => {
    const v = view.current;
    if (scene.current) scene.current.style.transform = `rotateX(${v.rx}deg) rotateY(${v.ry}deg)`;
    const el = stage.current;
    if (!el) return;
    el.style.setProperty("--zoom", String(v.zoom));
    // Тень на «столе» пропадает, когда книгу смотрят сверху или снизу.
    el.style.setProperty("--ground", String(clamp(1 - Math.abs(v.rx) / 70, 0, 1)));
    // Блик скользит по обложкам при повороте.
    el.style.setProperty("--sheen-f", `${50 + 70 * Math.sin((v.ry * Math.PI) / 180)}%`);
    el.style.setProperty("--sheen-b", `${50 - 70 * Math.sin((v.ry * Math.PI) / 180)}%`);
    const lights = new Map<string, number>();
    for (const s of shadeEls.current) {
      const id = s.dataset.shade as FaceId;
      if (!lights.has(id)) lights.set(id, shadeOpacity(faceLight(id, v)));
      s.style.opacity = String(lights.get(id));
    }
  }, []);

  // Кадр вызывает сам себя через ref: функция не может ссылаться на себя при объявлении.
  const frame = useRef<(now: number) => void>(() => {});
  const tick = useCallback(
    (now: number) => {
      const mo = motion.current;
      const v = view.current;
      const dt = Math.min(48, now - (mo.last || now));
      mo.last = now;
      let moving = false;
      if (mo.anim) {
        const a = mo.anim;
        const k = clamp((now - a.t0) / a.dur, 0, 1);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        v.rx = a.from.rx + (a.to.rx - a.from.rx) * e;
        v.ry = a.from.ry + (a.to.ry - a.from.ry) * e;
        v.zoom = a.from.zoom + (a.to.zoom - a.from.zoom) * e;
        if (k >= 1) mo.anim = null;
        moving = true;
      } else if (!mo.dragging && (Math.abs(mo.vx) > 0.002 || Math.abs(mo.vy) > 0.002)) {
        // Инерция после броска.
        v.ry += mo.vx * dt;
        v.rx = clamp(v.rx + mo.vy * dt, -TILT_LIMIT, TILT_LIMIT);
        const f = Math.exp(-dt / 260);
        mo.vx *= f;
        mo.vy *= f;
        moving = true;
      } else if (!mo.dragging && mo.auto) {
        v.ry += 0.014 * dt;
        moving = true;
      }
      apply();
      if (moving) mo.raf = requestAnimationFrame((t) => frame.current(t));
      else {
        mo.raf = 0;
        mo.last = 0;
      }
    },
    [apply],
  );
  useEffect(() => {
    frame.current = tick;
  }, [tick]);
  const kick = useCallback(() => {
    const mo = motion.current;
    if (!mo.raf) {
      mo.last = 0;
      mo.raf = requestAnimationFrame((t) => frame.current(t));
    }
  }, []);

  // Первая отрисовка, автоповорот (если пользователь не против анимации) и уборка.
  useLayoutEffect(() => {
    shadeEls.current = Array.from(stage.current?.querySelectorAll<HTMLElement>("[data-shade]") ?? []);
    apply();
  }, [apply, dims, art]);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mo = motion.current;
    if (reduced) {
      mo.auto = false;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- один раз при монтировании: синхронизируем кнопку с системной настройкой
      setAuto(false);
    }
    kick();
    return () => {
      cancelAnimationFrame(mo.raf);
      mo.raf = 0;
    };
  }, [kick]);

  const stopAuto = useCallback(() => {
    motion.current.auto = false;
    setAuto(false);
  }, []);
  const animateTo = useCallback(
    (to: Partial<Orientation> & { zoom?: number }, label: string | null = null) => {
      const v = view.current;
      const mo = motion.current;
      mo.vx = mo.vy = 0;
      const target = { rx: to.rx ?? v.rx, ry: v.ry + shortestDelta(v.ry, to.ry ?? v.ry), zoom: clamp(to.zoom ?? v.zoom, ZOOM.min, ZOOM.max) };
      setActive(label);
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        Object.assign(v, target);
        apply();
        return;
      }
      mo.anim = { from: { rx: v.rx, ry: v.ry, zoom: v.zoom }, to: target, t0: performance.now(), dur: 700 };
      kick();
    },
    [apply, kick],
  );
  const zoomBy = (factor: number) => {
    stopAuto();
    animateTo({ zoom: view.current.zoom * factor });
  };

  // ── Жесты: вращение одним пальцем, масштаб щипком ──
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const d = drag.current;
    const mo = motion.current;
    e.currentTarget.setPointerCapture(e.pointerId);
    d.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    mo.dragging = true;
    mo.anim = null;
    mo.vx = mo.vy = 0;
    stopAuto();
    setActive(null);
    d.last = { t: e.timeStamp, x: e.clientX, y: e.clientY };
    if (d.pointers.size === 2) {
      const [a, b] = [...d.pointers.values()];
      d.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: view.current.zoom };
    }
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.pointers.has(e.pointerId)) return;
    d.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const v = view.current;
    if (d.pointers.size >= 2 && d.pinch) {
      const [a, b] = [...d.pointers.values()];
      v.zoom = clamp(d.pinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / d.pinch.dist), ZOOM.min, ZOOM.max);
      apply();
      return;
    }
    if (!d.last) return;
    const dx = e.clientX - d.last.x;
    const dy = e.clientY - d.last.y;
    const dt = Math.max(1, e.timeStamp - d.last.t);
    v.ry += dx * 0.4;
    v.rx = clamp(v.rx - dy * 0.4, -TILT_LIMIT, TILT_LIMIT);
    const mo = motion.current;
    mo.vx = 0.8 * mo.vx + 0.2 * ((dx * 0.4) / dt);
    mo.vy = 0.8 * mo.vy + 0.2 * ((-dy * 0.4) / dt);
    d.last = { t: e.timeStamp, x: e.clientX, y: e.clientY };
    apply();
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    d.pointers.delete(e.pointerId);
    d.pinch = null;
    if (d.pointers.size === 0) {
      const mo = motion.current;
      mo.dragging = false;
      // Если палец перед отпусканием стоял на месте, инерции нет.
      if (d.last && e.timeStamp - d.last.t > 80) mo.vx = mo.vy = 0;
      d.last = null;
      kick();
    } else {
      const [p] = [...d.pointers.values()];
      d.last = { t: e.timeStamp, x: p.x, y: p.y };
    }
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const v = view.current;
    const step = 10;
    const handled: Record<string, () => void> = {
      ArrowLeft: () => animateTo({ ry: v.ry - step }),
      ArrowRight: () => animateTo({ ry: v.ry + step }),
      ArrowUp: () => animateTo({ rx: clamp(v.rx + step, -TILT_LIMIT, TILT_LIMIT) }),
      ArrowDown: () => animateTo({ rx: clamp(v.rx - step, -TILT_LIMIT, TILT_LIMIT) }),
      "+": () => animateTo({ zoom: v.zoom * ZOOM.step }),
      "=": () => animateTo({ zoom: v.zoom * ZOOM.step }),
      "-": () => animateTo({ zoom: v.zoom / ZOOM.step }),
      Home: () => animateTo({ ...INITIAL_VIEW, zoom: 1 }, null),
    };
    const run = handled[e.key];
    if (!run) return;
    e.preventDefault();
    stopAuto();
    run();
  };

  // Колёсико меняет масштаб только вместе с Ctrl/⌘, иначе страница перестала бы прокручиваться над моделью.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      view.current.zoom = clamp(view.current.zoom * Math.exp(-e.deltaY * 0.0025), ZOOM.min, ZOOM.max);
      apply();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [apply]);

  // ── Грани ──
  const { w: W, h: H, d: D } = dims;
  const bt = BOARD_MM;
  const strip: CSSProperties = { background: template.swatch, backgroundSize: "cover" };
  const spineSize = spineFontMm(D);
  const spineText = [data.cover.title || data.title, data.cover.names].filter(Boolean).join("   ·   ");
  const hinge = Math.min(14, W * 0.05);
  const names = data.cover.names;
  const frontNode = (
    <>
      {art.frontInline ? (
        <div className="absolute inset-0 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: art.frontInline }} />
      ) : (
        <div className="absolute inset-0" style={{ backgroundImage: art.front, backgroundSize: "100% 100%" }} />
      )}
      <CoverText template={template} title={data.cover.title} subtitle={data.cover.subtitle} names={names} titlePlaceholder={data.cover.titlePlaceholder} />
      {/* Шарнир у корешка и блик */}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(90deg, rgba(0,0,0,.22) 0, rgba(0,0,0,0) 1.2%, rgba(0,0,0,.2) ${((hinge / W) * 100).toFixed(2)}%, rgba(255,255,255,.1) ${((hinge / W) * 100 + 0.8).toFixed(2)}%, rgba(0,0,0,0) ${((hinge / W) * 100 + 4).toFixed(2)}%)` }} />
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(115deg, transparent calc(var(--sheen-f, 50%) - 14%), rgba(255,255,255,.16) var(--sheen-f, 50%), transparent calc(var(--sheen-f, 50%) + 14%))" }} />
    </>
  );
  const backNode = (
    <>
      <div className="absolute inset-0" style={{ backgroundImage: art.back, backgroundSize: "100% 100%" }} />
      {backText ? (
        <div className="absolute flex justify-center text-center" style={{ left: "15%", top: "30%", width: "70%", fontFamily: cssFont(template.back.font), fontStyle: "italic", fontSize: `${((12 * 25.4) / 72 / W) * 100}cqw`, lineHeight: 1.5, color: template.back.color }}>
          {backText}
        </div>
      ) : null}
      <div className="absolute inset-x-0 text-center uppercase" style={{ top: `${((H - 16) / H) * 100}%`, fontFamily: cssFont("montserrat"), fontWeight: 500, fontSize: `${((6.5 * 25.4) / 72 / W) * 100}cqw`, letterSpacing: "0.3em", color: template.back.color, opacity: 0.75 }}>
        {brand}
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(115deg, transparent calc(var(--sheen-b, 50%) - 14%), rgba(255,255,255,.14) var(--sheen-b, 50%), transparent calc(var(--sheen-b, 50%) + 14%))" }} />
    </>
  );
  const spineNode = (
    <>
      <div className="absolute inset-0" style={{ backgroundImage: art.spine, backgroundSize: "100% 100%" }} />
      {spineSize && spineText ? (
        // Размеры — в cqw от ширины самой грани (корешка): внутри грани единица --u уже не годится.
        <div className="absolute top-1/2 left-1/2 flex items-center justify-center whitespace-nowrap" style={{ width: `${(H / D) * 100}cqw`, height: "100cqw", transform: "translate(-50%, -50%) rotate(-90deg)", fontFamily: cssFont(template.spine.font), fontWeight: 500, fontSize: `${(spineSize / D) * 100}cqw`, color: template.spine.color }}>
          <span className="truncate" style={{ maxWidth: "92%" }}>
            {spineText}
          </span>
        </div>
      ) : null}
      {/* Округлость корешка */}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(0,0,0,.3), rgba(255,255,255,.1) 28%, rgba(255,255,255,0) 55%, rgba(0,0,0,.24))" }} />
    </>
  );
  const endpaper: CSSProperties = { background: "linear-gradient(135deg,#efe7d8,#e4d9c4)" };
  const zBoard = D / 2 - bt / 2;
  const blockX = -W / 2 + dims.block.w / 2;

  const views = ["front", "spine", "back", "edge", "top", "bottom"] as const;
  const sceneStyle = {
    "--zoom": 1,
    "--u": `calc(min(100cqw, 100cqh) / ${Math.round(extent * 1.08)} * var(--zoom))`,
  } as CSSProperties;

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <div
        ref={stage}
        role="group"
        aria-label={m.group}
        aria-roledescription="3D"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative w-full max-w-3xl cursor-grab touch-none overflow-hidden rounded-3xl bg-[radial-gradient(ellipse_at_50%_35%,#fffdf9,#efe7da_70%)] select-none focus-visible:outline-offset-4 active:cursor-grabbing"
        style={{ ...sceneStyle, aspectRatio: "5 / 4", containerType: "size" }}
      >
        <div aria-hidden className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-[50%] bg-black/35 blur-2xl" style={{ top: `calc(50% + ${L(H * 0.55)})`, width: L(W * 1.25), height: L(D * 3 + 8), opacity: "var(--ground, 1)" }} />
        <div className="absolute inset-0" style={{ perspective: `calc(${Math.round(extent * 3.4)} * var(--u))` }}>
          <div ref={scene} className="absolute top-1/2 left-1/2 size-0" style={{ transformStyle: "preserve-3d" }}>
            {/* Блок страниц: виден у верхнего, нижнего и бокового срезов */}
            <Cuboid
              w={dims.block.w}
              h={dims.block.h}
              d={dims.block.d}
              at={[blockX, 0, 0]}
              faces={{
                right: { shade: "edge", style: { background: PAPER_LINES(90) } },
                top: { shade: "top", style: { background: PAPER_LINES(180) } },
                bottom: { shade: "bottom", style: { background: PAPER_LINES(180) } },
              }}
            />
            {/* Передняя крышка */}
            <Cuboid
              w={W}
              h={H}
              d={bt}
              at={[0, 0, zBoard]}
              faces={{
                front: { shade: "front", node: frontNode },
                back: { shade: "back", style: endpaper },
                right: { shade: "edge", style: strip },
                top: { shade: "top", style: strip },
                bottom: { shade: "bottom", style: strip },
              }}
            />
            {/* Задняя крышка */}
            <Cuboid
              w={W}
              h={H}
              d={bt}
              at={[0, 0, -zBoard]}
              faces={{
                back: { shade: "back", node: backNode },
                front: { shade: "front", style: endpaper },
                right: { shade: "edge", style: strip },
                top: { shade: "top", style: strip },
                bottom: { shade: "bottom", style: strip },
              }}
            />
            {/* Корешок */}
            <Cuboid w={0.01} h={H} d={D} at={[-W / 2 - 0.05, 0, 0]} faces={{ left: { shade: "spine", node: spineNode } }} />
          </div>
        </div>
      </div>

      <div role="toolbar" aria-label={m.group} className="flex max-w-3xl flex-wrap items-center justify-center gap-2">
        {views.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={active === id}
            onClick={() => {
              stopAuto();
              animateTo({ ...VIEWS[id] }, id);
            }}
            className={cn("btn btn-sm", active === id ? "btn-primary" : "btn-outline")}
          >
            {m.views[id]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" className="btn btn-outline btn-sm" aria-label={m.zoomOut} title={m.zoomOut} onClick={() => zoomBy(1 / ZOOM.step)}>
          <Minus className="size-4" />
        </button>
        <button type="button" className="btn btn-outline btn-sm" aria-label={m.zoomIn} title={m.zoomIn} onClick={() => zoomBy(ZOOM.step)}>
          <Plus className="size-4" />
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          aria-pressed={auto}
          aria-label={auto ? m.autoOff : m.autoOn}
          title={auto ? m.autoOff : m.autoOn}
          onClick={() => {
            const mo = motion.current;
            mo.auto = !mo.auto;
            setAuto(mo.auto);
            if (mo.auto) kick();
          }}
        >
          {auto ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          aria-label={m.reset}
          title={m.reset}
          onClick={() => {
            stopAuto();
            animateTo({ ...INITIAL_VIEW, zoom: 1 });
          }}
        >
          <RotateCcw className="size-4" />
        </button>
        {onOpenBook ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={onOpenBook}>
            <BookOpen className="size-4" /> {m.open}
          </button>
        ) : null}
      </div>
      <p className="text-sm font-medium text-ink-soft">{m.dims(Math.round(format.widthMm), Math.round(format.heightMm), Math.round(D * 10) / 10, pageCount)}</p>
      <p className="max-w-xl text-center text-xs text-muted">
        {m.hint} {m.note}
      </p>
    </div>
  );
}
