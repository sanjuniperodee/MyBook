"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { useMessages } from "@/i18n/client";
import { CoverText } from "@/components/cover/CoverPreview";
import { designBack } from "@/lib/book/cover-back";
import { CoverBackLayer } from "@/components/cover/CoverBack";
import { CoverSpineText } from "@/components/cover/CoverSpine";
import { getCoverTemplate } from "@/lib/book/covers";
import { getFormat } from "@/lib/book/formats";
import {
  BOARD_MM,
  bookDims,
  clamp,
  faceLight,
  fitScale,
  INITIAL_VIEW,
  leafAngle,
  leafZ,
  modelExtent,
  pileState,
  READ_VIEW,
  READ_ZOOM,
  shadeOpacity,
  shortestDelta,
  TILT_LIMIT,
  VIEWS,
  ZOOM,
  type FaceId,
  type Orientation,
} from "@/lib/book/book-model";
import { clampPos, RENDER_WINDOW, visibleSpread, type Sheet } from "@/lib/book/flipbook";
import { cn } from "@/lib/utils";
import { buildCoverArt } from "./cover-art";
import { useCoverImage, useCoverSamples } from "./useCoverImage";
import { ViewerControls } from "./ViewerControls";
import { FaceView, usePagedBook, type FaceContext, type FlipbookData } from "./pages";

/** Длина в миллиметрах модели → CSS: --u — пикселей на миллиметр, зависит от размера кадра и масштаба. */
const L = (mm: number) => `calc(${Math.round(mm * 1000) / 1000} * var(--u))`;

type Side = "front" | "back" | "left" | "right" | "top" | "bottom";
type FaceSpec = { shade: FaceId; node?: ReactNode; style?: CSSProperties; flip?: "next" | "prev" };

/** Поворот грани и её сдвиг вдоль нормали: параллелепипед из шести плоскостей с общим центром. */
const SIDE: Record<Side, { rotate: string; size: (w: number, h: number, d: number) => [number, number]; push: (w: number, h: number, d: number) => number }> = {
  front: { rotate: "", size: (w, h) => [w, h], push: (_w, _h, d) => d / 2 },
  back: { rotate: "rotateY(180deg)", size: (w, h) => [w, h], push: (_w, _h, d) => d / 2 },
  right: { rotate: "rotateY(90deg)", size: (_w, h, d) => [d, h], push: (w) => w / 2 },
  left: { rotate: "rotateY(-90deg)", size: (_w, h, d) => [d, h], push: (w) => w / 2 },
  top: { rotate: "rotateX(90deg)", size: (w, _h, d) => [w, d], push: (_w, h) => h / 2 },
  bottom: { rotate: "rotateX(-90deg)", size: (w, _h, d) => [w, d], push: (_w, h) => h / 2 },
};

const hidden: CSSProperties = { backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" };
/** Прозрачный контур заставляет браузер сглаживать края повёрнутых плоскостей — без него они «лесенкой». */
const smooth: CSSProperties = { outline: "1px solid transparent" };

/** Параллелепипед w×h×d (мм) с центром в at; грани без описания не рисуются (их не видно снаружи). */
function Cuboid({ w, h, d, at = [0, 0, 0], leaf, faces }: { w: number; h: number; d: number; at?: [number, number, number]; leaf?: number; faces: Partial<Record<Side, FaceSpec>> }) {
  return (
    <div className="absolute top-0 left-0 size-0" style={{ transformStyle: "preserve-3d", transform: `translate3d(${L(at[0])}, ${L(at[1])}, ${L(at[2])})` }}>
      {(Object.keys(faces) as Side[]).map((side) => {
        const f = faces[side]!;
        const [fw, fh] = SIDE[side].size(w, h, d);
        return (
          <div
            key={side}
            data-flip={f.flip}
            className="absolute top-0 left-0 overflow-hidden"
            style={{ width: L(fw), height: L(fh), containerType: "inline-size", transform: `translate(-50%, -50%) ${SIDE[side].rotate} translateZ(${L(SIDE[side].push(w, h, d))})`, ...hidden, ...smooth, ...f.style }}
          >
            {f.node}
            {/* Затемнение по освещению: прозрачность обновляется при каждом повороте */}
            <div aria-hidden data-shade={f.shade} data-leaf={leaf} className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: 0 }} />
          </div>
        );
      })}
    </div>
  );
}

/** Бумажный срез: гладкая основа и еле заметные штрихи листов — частые линии давали бы муар. */
const paperEdge = (deg: number): CSSProperties => ({
  background: `repeating-linear-gradient(${deg}deg, rgba(110,90,60,0) 0 2px, rgba(110,90,60,.09) 2px 3px), linear-gradient(${deg + 90}deg, #efe7d8, #f8f3e9 40%, #efe7d8)`,
});

const endpaper: CSSProperties = { background: "linear-gradient(135deg,#efe7d8,#e4d9c4)" };

/** Лист блока: две полосы на общей плоскости, вращается вокруг оси корешка (поворот задаёт родитель). */
const PageLeaf = memo(function PageLeaf({
  index,
  sheet,
  ctx,
  near,
  pivotX,
  w,
  h,
  z,
  reg,
}: {
  index: number;
  sheet: Sheet;
  ctx: FaceContext;
  near: boolean;
  pivotX: number;
  w: number;
  h: number;
  z: number;
  reg: (i: number, el: HTMLElement | null) => void;
}) {
  const page = sheet.kind === "pages" ? sheet : null;
  const gutter = (dir: "right" | "left") => `linear-gradient(to ${dir}, rgba(0,0,0,.2), rgba(0,0,0,.05) 7%, rgba(0,0,0,0) 18%)`;
  return (
    <div className="absolute top-0 left-0 size-0" style={{ transformStyle: "preserve-3d", transform: `translate3d(${L(pivotX)}, 0, 0)` }}>
      <div ref={(el) => reg(index, el)} className="absolute top-0 left-0 size-0" style={{ transformStyle: "preserve-3d", display: "none" }}>
        <div className="absolute top-0 left-0" style={{ width: L(w), height: L(h), transformStyle: "preserve-3d", transform: `translate(0, -50%) translateZ(${L(z)})` }}>
          <div data-flip="next" className="absolute inset-0 overflow-hidden bg-white" style={{ ...hidden, ...smooth }}>
            {near && page ? <FaceView face={page.front} no={page.frontNo} ctx={ctx} /> : null}
            <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: gutter("right") }} />
            <div aria-hidden data-shade="front" data-leaf={index} data-k="0.4" data-turn="" className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: 0 }} />
          </div>
          <div data-flip="prev" className="absolute inset-0 overflow-hidden bg-white" style={{ ...hidden, ...smooth, transform: "rotateY(180deg)" }}>
            {near && page ? <FaceView face={page.back} no={page.backNo} ctx={ctx} /> : null}
            <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: gutter("left") }} />
            <div aria-hidden data-shade="back" data-leaf={index} data-k="0.4" data-turn="" className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: 0 }} />
          </div>
        </div>
      </div>
    </div>
  );
});

const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Pointers {
  map: Map<number, { x: number; y: number }>;
  pinch: { dist: number; zoom: number } | null;
  last: { t: number; x: number; y: number } | null;
  start: { x: number; y: number; flip: "next" | "prev" | null; moved: boolean } | null;
}

/**
 * Книга как предмет: вращается мышью и пальцем со всех сторон, а клик по обложке и страницам открывает её и листает.
 * Всё — один набор плоскостей CSS 3D: обложка и листы вращаются вокруг оси корешка, две стопки страниц растут и убывают.
 */
export function BookViewer3D({ data, className }: { data: FlipbookData; className?: string }) {
  const m = useMessages().books.preview;
  const f = m.flip;
  const mm = m.model;
  const format = getFormat(data.formatId);
  const template = getCoverTemplate(data.cover.template);
  const { pageCount, brand, back, backPhotos } = data.model;
  const { sheets, ctx, measure } = usePagedBook(data);

  const dims = useMemo(() => bookDims(format, pageCount), [format, pageCount]);
  const backDesign = useMemo(() => designBack(template, dims.w, dims.h, back), [template, dims, back]);
  const extent = modelExtent(dims);
  const count = sheets.length;
  /** Листов блока: между обложкой и задней крышкой. */
  const M = Math.max(1, count - 2);

  // ── Арт обложки: лицо, оборот и корешок — отдельными обрезанными картинками ──
  const imageHref = useCoverImage(template);
  const samples = useCoverSamples(template);
  const art = useMemo(
    () => buildCoverArt(template, format, pageCount, dims, { photos: data.cover.photos, imageHref, plainBack: backDesign.plainArt, samples }),
    [template, format, pageCount, dims, data.cover.photos, imageHref, backDesign.plainArt, samples],
  );

  // ── Состояние просмотра хранится вне React: каждый кадр обновляет стили напрямую ──
  const wrapper = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const orbit = useRef<HTMLDivElement>(null);
  const shift = useRef<HTMLDivElement>(null);
  const pileR = useRef<HTMLDivElement>(null);
  const pileL = useRef<HTMLDivElement>(null);
  const leafEls = useRef<(HTMLElement | null)[]>([]);
  const shadeEls = useRef<HTMLElement[]>([]);
  const lastAngle = useRef<number[]>([]);
  const view = useRef({ ...INITIAL_VIEW, zoom: 1 });
  const pos = useRef(0);
  const target = useRef(0);
  const cfg = useRef({ W: dims.w, H: dims.h, Db: dims.block.d, bw: dims.block.w, M, count, fit: (o: number) => fitScale(dims, o) });
  const motion = useRef({
    vx: 0,
    vy: 0,
    dragging: false,
    auto: true,
    visible: true,
    anim: null as null | { from: Orientation & { zoom: number }; to: Orientation & { zoom: number }; t0: number; dur: number },
    flip: null as null | { from: number; to: number; t0: number; dur: number },
    last: 0,
    raf: 0,
  });
  const pointers = useRef<Pointers>({ map: new Map(), pinch: null, last: null, start: null });
  const [slot, setSlot] = useState(0);
  const slotRef = useRef(0);
  const [auto, setAuto] = useState(true);
  const [active, setActive] = useState<string | null>("front");

  useLayoutEffect(() => {
    cfg.current = { W: dims.w, H: dims.h, Db: dims.block.d, bw: dims.block.w, M, count, fit: (o: number) => fitScale(dims, o) };
  }, [dims, M, count]);

  const reg = useCallback((i: number, el: HTMLElement | null) => {
    leafEls.current[i] = el;
  }, []);

  const apply = useCallback(() => {
    const v = view.current;
    const { W, Db, M: pages, count: n, fit } = cfg.current;
    const p = clamp(pos.current, 0, Math.max(0, n - 1));
    const open = clamp(p, 0, 1);
    if (orbit.current) orbit.current.style.transform = `scale3d(${fit(open)}, ${fit(open)}, ${fit(open)}) rotateX(${v.rx}deg) rotateY(${v.ry}deg)`;
    // Раскрывающаяся книга уходит влево вместе с корешком, и центр вращения остаётся посередине разворота.
    if (shift.current) shift.current.style.transform = `translateX(${L(open * (W / 2))})`;
    const el = stage.current;
    if (el) {
      el.style.setProperty("--zoom", String(v.zoom));
      // Тень на «столе» пропадает, когда книгу смотрят сверху или снизу.
      el.style.setProperty("--ground", String(clamp(1 - Math.abs(v.rx) / 70, 0, 1)));
      // Блик скользит по обложкам при повороте.
      el.style.setProperty("--sheen-f", `${50 + 70 * Math.sin((v.ry * Math.PI) / 180)}%`);
      el.style.setProperty("--sheen-b", `${50 - 70 * Math.sin((v.ry * Math.PI) / 180)}%`);
    }
    // Листы: обложка (0) и листы блока (1…pages) вращаются вокруг корешка, далёкие скрыты — вместо них стопки.
    const visible = new Set<number>([0]);
    for (let i = 0; i <= pages; i++) {
      const a = leafAngle(p, i);
      const node = leafEls.current[i];
      if (!node) continue;
      const shown = i === 0 || (p > 0.001 && Math.abs(i - p) <= RENDER_WINDOW);
      if (shown) visible.add(i);
      const wasShown = node.style.display !== "none";
      if (shown !== wasShown) node.style.display = shown ? "" : "none";
      if (shown && lastAngle.current[i] !== a) {
        lastAngle.current[i] = a;
        node.style.transform = `rotateY(${-a}deg)`;
      }
    }
    // Стопки страниц растут и убывают по мере листания.
    const piles = pileState(p, pages, Db);
    const place = (node: HTMLElement | null, count: number, z: number, s: number) => {
      if (!node) return;
      node.style.display = count ? "" : "none";
      node.style.transform = `translateZ(${L(z)}) scale3d(1, 1, ${s})`;
    };
    place(pileR.current, piles.right, piles.rightZ, piles.rightScale);
    place(pileL.current, piles.left, piles.leftZ, piles.leftScale);
    // Освещение: каждая грань темнеет по тому, куда повёрнута её нормаль (с учётом поворота листа).
    for (const s of shadeEls.current) {
      const leaf = s.dataset.leaf ? Number(s.dataset.leaf) : null;
      if (leaf !== null && !visible.has(leaf)) continue;
      const a = leaf === null ? 0 : leafAngle(p, leaf);
      const k = s.dataset.k ? Number(s.dataset.k) : 1;
      const turn = s.dataset.turn !== undefined ? Math.sin((a * Math.PI) / 180) * 0.06 : 0;
      s.style.opacity = String(shadeOpacity(faceLight(s.dataset.shade as FaceId, v, a)) * k + turn);
    }
    const rounded = Math.round(p);
    if (rounded !== slotRef.current) {
      slotRef.current = rounded;
      setSlot(rounded);
    }
  }, []);

  // Листы рисуются, пока они возле текущей страницы; список освещаемых граней обновляем вместе с ними.
  useLayoutEffect(() => {
    shadeEls.current = Array.from(stage.current?.querySelectorAll<HTMLElement>("[data-shade]") ?? []);
    lastAngle.current = [];
    apply();
  }, [apply, dims, art, count, slot, ctx]);

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
        const e = easeInOut(k);
        v.rx = a.from.rx + (a.to.rx - a.from.rx) * e;
        v.ry = a.from.ry + (a.to.ry - a.from.ry) * e;
        v.zoom = a.from.zoom + (a.to.zoom - a.from.zoom) * e;
        if (k >= 1) mo.anim = null;
        moving = true;
      } else if (!mo.dragging && (Math.abs(mo.vx) > 0.002 || Math.abs(mo.vy) > 0.002)) {
        // Инерция после броска.
        v.ry += mo.vx * dt;
        v.rx = clamp(v.rx + mo.vy * dt, -TILT_LIMIT, TILT_LIMIT);
        const decay = Math.exp(-dt / 260);
        mo.vx *= decay;
        mo.vy *= decay;
        moving = true;
      } else if (!mo.dragging && mo.auto && !mo.flip && pos.current < 0.001) {
        // Закрытая книга медленно поворачивается сама; открытую не трогаем — её читают.
        v.ry += 0.014 * dt;
        moving = true;
      }
      if (mo.flip) {
        const fl = mo.flip;
        const k = clamp((now - fl.t0) / fl.dur, 0, 1);
        pos.current = fl.from + (fl.to - fl.from) * easeInOut(k);
        if (k >= 1) mo.flip = null;
        moving = true;
      }
      apply();
      // Вне экрана и на скрытой вкладке кадры не нужны: цикл засыпает и просыпается по событиям.
      if (moving && mo.visible && !document.hidden) mo.raf = requestAnimationFrame((t) => frame.current(t));
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

  useEffect(() => {
    const mo = motion.current;
    if (prefersReducedMotion()) {
      mo.auto = false;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- один раз при монтировании: синхронизируем кнопку с системной настройкой
      setAuto(false);
    }
    const el = stage.current;
    const io = el ? new IntersectionObserver(([entry]) => {
      mo.visible = entry.isIntersecting;
      if (mo.visible) kick();
    }) : null;
    if (el) io?.observe(el);
    const onVisibility = () => !document.hidden && kick();
    document.addEventListener("visibilitychange", onVisibility);
    kick();
    return () => {
      io?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
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
      const next = { rx: to.rx ?? v.rx, ry: v.ry + shortestDelta(v.ry, to.ry ?? v.ry), zoom: clamp(to.zoom ?? v.zoom, ZOOM.min, ZOOM.max) };
      setActive(label);
      if (prefersReducedMotion()) {
        Object.assign(v, next);
        apply();
        return;
      }
      mo.anim = { from: { rx: v.rx, ry: v.ry, zoom: v.zoom }, to: next, t0: performance.now(), dur: 700 };
      kick();
    },
    [apply, kick],
  );
  /** Листает к странице n; открывая закрытую книгу, разворачивает её к читателю. */
  const goTo = useCallback(
    (n: number) => {
      const mo = motion.current;
      const to = Math.round(clampPos(n, Math.max(1, cfg.current.count)));
      const from = pos.current;
      target.current = to;
      if (from < 0.5 && to >= 1) {
        // Открытую книгу удобно читать только лицом к себе: если смотрели сбоку или снизу, разворачиваем.
        const v = view.current;
        if (Math.abs(shortestDelta(v.ry, 0)) > 8 || v.rx > -10 || v.rx < -60) animateTo({ ...READ_VIEW, zoom: Math.max(v.zoom, READ_ZOOM) }, "read");
      }
      if (to === from) return;
      if (prefersReducedMotion()) {
        pos.current = to;
        apply();
        return;
      }
      const dist = Math.abs(to - from);
      mo.flip = { from, to, t0: performance.now(), dur: Math.min(1500, 700 + 110 * Math.max(0, dist - 1)) };
      kick();
    },
    [animateTo, apply, kick],
  );
  const zoomBy = (factor: number) => {
    stopAuto();
    animateTo({ zoom: view.current.zoom * factor }, active);
  };

  // ── Жесты: вращение одним пальцем, масштаб щипком, клик по странице листает ──
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const p = pointers.current;
    const mo = motion.current;
    e.currentTarget.setPointerCapture(e.pointerId);
    p.map.set(e.pointerId, { x: e.clientX, y: e.clientY });
    mo.dragging = true;
    mo.anim = null;
    mo.vx = mo.vy = 0;
    stopAuto();
    if (p.map.size === 1) {
      const flip = (e.target as HTMLElement).closest<HTMLElement>("[data-flip]")?.dataset.flip;
      p.start = { x: e.clientX, y: e.clientY, flip: flip === "next" || flip === "prev" ? flip : null, moved: false };
    } else if (p.start) {
      p.start.moved = true;
    }
    p.last = { t: e.timeStamp, x: e.clientX, y: e.clientY };
    if (p.map.size === 2) {
      const [a, b] = [...p.map.values()];
      p.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: view.current.zoom };
    }
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const p = pointers.current;
    if (!p.map.has(e.pointerId)) return;
    p.map.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const v = view.current;
    if (p.map.size >= 2 && p.pinch) {
      const [a, b] = [...p.map.values()];
      v.zoom = clamp(p.pinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / p.pinch.dist), ZOOM.min, ZOOM.max);
      apply();
      return;
    }
    if (!p.last || !p.start) return;
    // Пока палец не ушёл за порог, это ещё может быть клик — модель не дёргаем.
    if (!p.start.moved) {
      if (Math.hypot(e.clientX - p.start.x, e.clientY - p.start.y) < 6) return;
      p.start.moved = true;
      setActive(null);
      p.last = { t: e.timeStamp, x: e.clientX, y: e.clientY };
      return;
    }
    const dx = e.clientX - p.last.x;
    const dy = e.clientY - p.last.y;
    const dt = Math.max(1, e.timeStamp - p.last.t);
    v.ry += dx * 0.4;
    v.rx = clamp(v.rx - dy * 0.4, -TILT_LIMIT, TILT_LIMIT);
    const mo = motion.current;
    mo.vx = 0.8 * mo.vx + 0.2 * ((dx * 0.4) / dt);
    mo.vy = 0.8 * mo.vy + 0.2 * ((-dy * 0.4) / dt);
    p.last = { t: e.timeStamp, x: e.clientX, y: e.clientY };
    apply();
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const p = pointers.current;
    p.map.delete(e.pointerId);
    p.pinch = null;
    if (p.map.size === 0) {
      const mo = motion.current;
      mo.dragging = false;
      const start = p.start;
      p.start = null;
      if (start && !start.moved && start.flip && !cancelled) {
        goTo(target.current + (start.flip === "next" ? 1 : -1));
      } else if (p.last && e.timeStamp - p.last.t > 80) {
        // Если палец перед отпусканием стоял на месте, инерции нет.
        mo.vx = mo.vy = 0;
      }
      p.last = null;
      kick();
    } else {
      const [rest] = [...p.map.values()];
      p.last = { t: e.timeStamp, x: rest.x, y: rest.y };
    }
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const v = view.current;
    const step = 10;
    const orbitKey = e.shiftKey;
    const actions: Record<string, () => void> = {
      ArrowRight: () => (orbitKey ? animateTo({ ry: v.ry + step }) : goTo(target.current + 1)),
      ArrowLeft: () => (orbitKey ? animateTo({ ry: v.ry - step }) : goTo(target.current - 1)),
      ArrowUp: () => animateTo({ rx: clamp(v.rx + step, -TILT_LIMIT, TILT_LIMIT) }),
      ArrowDown: () => animateTo({ rx: clamp(v.rx - step, -TILT_LIMIT, TILT_LIMIT) }),
      PageDown: () => goTo(target.current + 1),
      PageUp: () => goTo(target.current - 1),
      Home: () => goTo(0),
      End: () => goTo(cfg.current.count - 1),
      "+": () => animateTo({ zoom: v.zoom * ZOOM.step }, active),
      "=": () => animateTo({ zoom: v.zoom * ZOOM.step }, active),
      "-": () => animateTo({ zoom: v.zoom / ZOOM.step }, active),
      "0": () => animateTo({ ...INITIAL_VIEW, zoom: 1 }),
    };
    const run = actions[e.key];
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

  // ── Полный экран ──
  const canFull = useSyncExternalStore(
    () => () => {},
    () => document.fullscreenEnabled,
    () => false,
  );
  const [full, setFull] = useState(false);
  useEffect(() => {
    const sync = () => setFull(document.fullscreenElement === wrapper.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrapper.current?.requestFullscreen();
  };

  // ── Грани обложки ──
  const { w: W, h: H, d: D } = dims;
  const bt = BOARD_MM;
  const strip: CSSProperties = { background: template.swatch, backgroundSize: "cover" };
  const hinge = Math.min(14, W * 0.05);
  const hingePct = (hinge / W) * 100;
  const frontNode = (
    <>
      {art.frontInline ? (
        <div className="absolute inset-0 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: art.frontInline }} />
      ) : (
        <div className="absolute inset-0" style={{ backgroundImage: art.front, backgroundSize: "100% 100%" }} />
      )}
      <CoverText template={template} title={data.cover.title} subtitle={data.cover.subtitle} names={data.cover.names} titlePlaceholder={data.cover.titlePlaceholder} />
      {/* Шарнир у корешка и блик */}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(90deg, rgba(0,0,0,.22) 0, rgba(0,0,0,0) 1.2%, rgba(0,0,0,.2) ${hingePct.toFixed(2)}%, rgba(255,255,255,.1) ${(hingePct + 0.8).toFixed(2)}%, rgba(0,0,0,0) ${(hingePct + 4).toFixed(2)}%)` }} />
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(115deg, transparent calc(var(--sheen-f, 50%) - 14%), rgba(255,255,255,.16) var(--sheen-f, 50%), transparent calc(var(--sheen-f, 50%) + 14%))" }} />
    </>
  );
  const backNode = (
    <>
      <div className="absolute inset-0" style={{ backgroundImage: art.back, backgroundSize: "100% 100%" }} />
      <CoverBackLayer design={backDesign} widthMm={dims.w} heightMm={dims.h} photos={backPhotos} brand={brand} />
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(115deg, transparent calc(var(--sheen-b, 50%) - 14%), rgba(255,255,255,.14) var(--sheen-b, 50%), transparent calc(var(--sheen-b, 50%) + 14%))" }} />
    </>
  );
  const spineNode = (
    <>
      <div className="absolute inset-0" style={{ backgroundImage: art.spine, backgroundSize: "100% 100%" }} />
      {/* Размеры — в cqw от ширины самой грани (корешка): внутри грани единица --u уже не годится. */}
      <CoverSpineText template={template} title={data.cover.title || data.title} names={data.cover.names} widthMm={D} heightMm={H} />
      {/* Округлость корешка */}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(0,0,0,.3), rgba(255,255,255,.1) 28%, rgba(255,255,255,0) 55%, rgba(0,0,0,.24))" }} />
    </>
  );
  const zBoard = D / 2 - bt / 2;
  const pivotX = -W / 2;
  const bw = dims.block.w;
  const bh = dims.block.h;

  const sceneStyle = {
    "--zoom": 1,
    "--u": `calc(min(100cqw, 100cqh) / ${Math.round(extent * 1.08)} * var(--zoom))`,
  } as CSSProperties;
  const spread = count ? visibleSpread(slot, count) : { left: null, right: null };
  const label = !count ? f.loading : slot === 0 ? f.cover : slot === count - 1 ? f.backCover : f.pages(spread.left, spread.right);

  return (
    <div ref={wrapper} className={cn("flex flex-col items-center gap-4", full && "justify-center bg-paper p-4", className)}>
      {measure}
      <div
        ref={stage}
        role="group"
        aria-label={mm.group}
        aria-roledescription="3D"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => onPointerUp(e)}
        onPointerCancel={(e) => onPointerUp(e, true)}
        className="relative w-full cursor-grab touch-none overflow-hidden rounded-3xl bg-[radial-gradient(ellipse_at_50%_35%,#fffdf9,#efe7da_70%)] select-none focus-visible:outline-offset-4 active:cursor-grabbing"
        style={{ ...sceneStyle, containerType: "size", ...(full ? { height: "calc(100dvh - 12rem)" } : { maxWidth: "48rem", aspectRatio: "5 / 4" }) }}
      >
        <div aria-hidden className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-[50%] bg-black/35 blur-2xl" style={{ top: `calc(50% + ${L(H * 0.56)})`, width: L(W * 1.1), height: L(D * 2 + 6), opacity: "calc(var(--ground, 1) * 0.8)" }} />
        <div className="absolute inset-0" style={{ perspective: `calc(${Math.round(extent * 3.4)} * var(--u))` }}>
          <div ref={orbit} className="absolute top-1/2 left-1/2 size-0" style={{ transformStyle: "preserve-3d" }}>
            <div ref={shift} className="absolute top-0 left-0 size-0" style={{ transformStyle: "preserve-3d" }}>
              {/* Правая стопка страниц: убывает по мере листания; видны её срезы */}
              <div ref={pileR} className="absolute top-0 left-0 size-0" style={{ transformStyle: "preserve-3d" }}>
                <Cuboid w={bw} h={bh} d={dims.block.d} at={[pivotX + bw / 2, 0, 0]} faces={{ right: { shade: "edge", style: paperEdge(90) }, top: { shade: "top", style: paperEdge(180) }, bottom: { shade: "bottom", style: paperEdge(180) } }} />
              </div>
              {/* Левая стопка: растёт, когда листы перевёрнуты */}
              <div ref={pileL} className="absolute top-0 left-0 size-0" style={{ transformStyle: "preserve-3d", display: "none" }}>
                <Cuboid w={bw} h={bh} d={dims.block.d} at={[pivotX - bw / 2, 0, 0]} faces={{ left: { shade: "spine", style: paperEdge(90) }, top: { shade: "top", style: paperEdge(180) }, bottom: { shade: "bottom", style: paperEdge(180) } }} />
              </div>

              {/* Задняя крышка */}
              <Cuboid
                w={W}
                h={H}
                d={bt}
                at={[0, 0, -zBoard]}
                faces={{
                  back: { shade: "back", node: backNode },
                  front: { shade: "front", style: endpaper, flip: "prev" },
                  right: { shade: "edge", style: strip },
                  top: { shade: "top", style: strip },
                  bottom: { shade: "bottom", style: strip },
                }}
              />
              {/* Корешок */}
              <Cuboid w={0.01} h={H} d={D} at={[-W / 2 - 0.05, 0, 0]} faces={{ left: { shade: "spine", node: spineNode } }} />

              {/* Листы блока: плоскости с текстом, вращаются вокруг оси корешка */}
              {ctx
                ? sheets.slice(1, count - 1).map((sheet, k) => {
                    const index = k + 1;
                    return <PageLeaf key={index} index={index} sheet={sheet} ctx={ctx} near={Math.abs(index - slot) <= RENDER_WINDOW + 1} pivotX={pivotX} w={bw} h={bh} z={leafZ(index, M, dims.block.d)} reg={reg} />;
                  })
                : null}

              {/* Передняя крышка: картонная плита на шарнире, откидывается влево */}
              <div className="absolute top-0 left-0 size-0" style={{ transformStyle: "preserve-3d", transform: `translate3d(${L(pivotX)}, 0, 0)` }}>
                <div ref={(el) => reg(0, el)} className="absolute top-0 left-0 size-0" style={{ transformStyle: "preserve-3d" }}>
                  <Cuboid
                    w={W}
                    h={H}
                    d={bt}
                    at={[W / 2, 0, zBoard]}
                    leaf={0}
                    faces={{
                      front: { shade: "front", node: frontNode, flip: "next" },
                      back: { shade: "back", style: endpaper, flip: "prev" },
                      right: { shade: "edge", style: strip },
                      top: { shade: "top", style: strip },
                      bottom: { shade: "bottom", style: strip },
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ViewerControls
        count={count}
        slot={slot}
        label={label}
        active={active}
        auto={auto}
        canFull={canFull}
        full={full}
        dimsText={mm.dims(Math.round(format.widthMm), Math.round(format.heightMm), Math.round(D * 10) / 10, pageCount)}
        onPrev={() => { stopAuto(); goTo(target.current - 1); }}
        onNext={() => { stopAuto(); goTo(target.current + 1); }}
        onSeek={(n) => { stopAuto(); goTo(n); }}
        onView={(id) => { stopAuto(); animateTo({ ...VIEWS[id] }, id); }}
        onRead={() => {
          stopAuto();
          if (pos.current < 0.5) goTo(1);
          animateTo({ ...READ_VIEW, zoom: Math.max(view.current.zoom, READ_ZOOM) }, "read");
        }}
        onZoom={zoomBy}
        onAuto={() => {
          const mo = motion.current;
          mo.auto = !mo.auto;
          setAuto(mo.auto);
          if (mo.auto) kick();
        }}
        onReset={() => { stopAuto(); animateTo({ ...INITIAL_VIEW, zoom: 1 }, "front"); }}
        onFull={toggleFull}
      />
    </div>
  );
}
