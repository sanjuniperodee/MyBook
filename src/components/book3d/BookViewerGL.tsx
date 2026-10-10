"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { useMessages } from "@/i18n/client";
import { designBack } from "@/lib/book/cover-back";
import { getCoverTemplate } from "@/lib/book/covers";
import { getFormat } from "@/lib/book/formats";
import { APERTURE, apertureDegrees, bookDims, clamp } from "@/lib/book/book-model";
import { RENDER_WINDOW, visibleSpread } from "@/lib/book/flipbook";
import { cn } from "@/lib/utils";
import { FaceView, usePagedBook, type FlipbookData } from "./pages";
import { photoHref, type PhotoRef } from "@/lib/book/cover-kit";
import { buildCoverArt } from "./cover-art";
import { useCoverImage } from "./useCoverImage";
import { ViewerControls, type ViewId } from "./ViewerControls";
import { RasterHost, type RasterJob } from "./webgl/RasterHost";
import { CoverBackFace, CoverFrontFace, CoverSpineFace } from "./webgl/cover-faces";
import { BookScene, type FaceKey } from "./webgl/scene";

/** Ракурсы осмотра: азимут и полярный угол камеры в радианах. */
const VIEW_ANGLES: Record<ViewId, { azimuth: number; polar: number }> = {
  front: { azimuth: 0, polar: Math.PI / 2 },
  spine: { azimuth: -Math.PI / 2, polar: Math.PI / 2 },
  back: { azimuth: Math.PI, polar: Math.PI / 2 },
  edge: { azimuth: Math.PI / 2, polar: Math.PI / 2 },
  top: { azimuth: 0, polar: 0.02 },
  bottom: { azimuth: 0, polar: Math.PI - 0.02 },
};
const INITIAL = { azimuth: -0.49, polar: 1.33 };
const READ = { azimuth: 0, polar: 1.36, zoom: 1.04 };
/** Листы вокруг читаемой страницы, для которых держим текстуры: окно отрисовки плюс запас на следующий переворот. */
const KEEP = RENDER_WINDOW + 1;

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Средний цвет холста — по нему красится кромка крышек, чтобы она совпала с материалом обложки. */
function averageColor(canvas: HTMLCanvasElement) {
  const probe = document.createElement("canvas");
  probe.width = probe.height = 1;
  const ctx = probe.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}

/** Короткий отпечаток строки: версия арта обложки должна меняться при любой правке кадра. */
function hash(text: string) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Фото клиента как data-URL: картинка-SVG и снимок вёрстки не загружают чужие файлы. */
async function toDataUrl(url: string) {
  const blob = await (await fetch(url)).blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Книга в WebGL (Three.js): вращается со всех сторон, обложка откидывается, листы гнутся при перевороте. Страницы —
 * та же вёрстка, что в PDF: HTML-компоненты растеризуются в текстуры лениво, только для листов возле читаемой страницы.
 */
export function BookViewerGL({ data, onUnsupported, className }: { data: FlipbookData; onUnsupported?: () => void; className?: string }) {
  const m = useMessages().books.preview;
  const f = m.flip;
  const mm = m.model;
  const format = getFormat(data.formatId);
  const template = getCoverTemplate(data.cover.template);
  const { pageCount, brand, back, backPhotos } = data.model;
  const { sheets, ctx, measure } = usePagedBook(data);
  const count = sheets.length;
  /** Листов блока между обложкой и задней крышкой. */
  const M = Math.max(1, count - 2);
  const dims = useMemo(() => bookDims(format, pageCount), [format, pageCount]);
  const backDesign = useMemo(() => designBack(template, dims.w, dims.h, back), [template, dims, back]);

  // Размер текстуры: на телефонах поменьше, чтобы уложиться в память.
  const texW = useMemo(() => (typeof window !== "undefined" && Math.min(window.innerWidth, window.innerHeight) < 700 ? 768 : 1024), []);
  const pageH = Math.round((texW * dims.block.h) / dims.block.w);
  const boardH = Math.round((texW * dims.h) / dims.w);
  const spineW = Math.max(48, Math.round((dims.d * texW) / dims.w));

  // Фото обложки встраиваются в SVG data-URL: иначе их не увидит растеризация в текстуру. Размеры и кадр (масштаб,
  // положение) едут вместе с адресом: по ним снимок ставится в место так же, как в редакторе.
  const [photoHrefs, setPhotoHrefs] = useState<(PhotoRef | undefined)[] | undefined>();
  const photoKey = JSON.stringify(data.cover.photos ?? []);
  useEffect(() => {
    const refs = (JSON.parse(photoKey) as (PhotoRef | null)[]).map((r) => r ?? undefined);
    if (!template.requiresPhoto || !refs.some(Boolean)) return;
    let alive = true;
    Promise.all(
      refs.map(async (ref) => {
        const url = photoHref(ref);
        if (!url) return undefined;
        const href = await toDataUrl(url).catch(() => undefined);
        if (!href) return undefined;
        return typeof ref === "string" || !ref ? href : { ...ref, href };
      }),
    ).then((list) => alive && setPhotoHrefs(list));
    return () => {
      alive = false;
    };
  }, [template.requiresPhoto, photoKey]);
  const imageHref = useCoverImage(template);
  // Фото и снимок обложки приходят позже первой отрисовки: по этой версии пересоздаём текстуры обложки.
  const artVersion = `${template.id}:${photoHrefs ? photoHrefs.map((h) => (h ? 1 : 0)).join("") : "-"}:${hash(photoKey)}:${imageHref ? 1 : 0}:${backDesign.plainArt ? 1 : 0}`;
  const art = useMemo(() => buildCoverArt(template, format, pageCount, dims, { photos: photoHrefs, imageHref, plainBack: backDesign.plainArt }), [template, format, pageCount, dims, photoHrefs, imageHref, backDesign.plainArt]);

  const wrapper = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<BookScene | null>(null);
  const countRef = useRef(count);
  const target = useRef(0);
  const slotRef = useRef(0);
  const have = useRef(new Set<FaceKey>());
  const [slot, setSlot] = useState(0);
  const [auto, setAuto] = useState(() => !prefersReducedMotion());
  const [active, setActive] = useState<string | null>("front");
  const [jobs, setJobs] = useState<RasterJob[]>([]);
  const [ready, setReady] = useState(false);
  const [aperture, setAperture] = useState<number>(APERTURE.default);
  const apertureRef = useRef<number>(APERTURE.default);
  const unsupported = useRef(onUnsupported);
  useEffect(() => {
    countRef.current = count;
    unsupported.current = onUnsupported;
  });

  /** Листает к позиции n; открывая закрытую книгу, разворачивает её к читателю. */
  const goTo = useCallback((n: number) => {
    const s = scene.current;
    if (!s) return;
    const to = Math.round(clamp(n, 0, Math.max(0, countRef.current - 1)));
    const from = s.position;
    target.current = to;
    if (from < 0.5 && to >= 1) {
      const v = s.getView();
      // Открытую книгу удобно читать только лицом к себе: если смотрели сбоку, сверху или снизу, разворачиваем.
      if (Math.abs(v.azimuth) > 0.14 || v.polar > 1.5 || v.polar < 0.8) {
        s.setView({ azimuth: READ.azimuth, polar: READ.polar, distance: s.baseDistance / READ.zoom }, 750);
        setActive("read");
      }
    }
    if (to !== from) s.flipTo(to, Math.min(1500, 700 + 110 * Math.max(0, Math.abs(to - from) - 1)));
  }, []);

  // ── Сцена: создаётся, когда известно число листов; пересоздаётся, если оно или размеры изменились ──
  useEffect(() => {
    const el = canvas.current;
    const box = stage.current;
    if (!el || !box || !count) return;
    let s: BookScene;
    try {
      s = new BookScene({ canvas: el, dims, leaves: M, reducedMotion: prefersReducedMotion() });
    } catch {
      unsupported.current?.();
      return;
    }
    scene.current = s;
    have.current.clear();
    s.setAperture(apertureRef.current);
    s.setPosition(target.current);
    s.onPosition = (p) => {
      const r = Math.round(p);
      if (r !== slotRef.current) {
        slotRef.current = r;
        setSlot(r);
      }
    };
    s.onInteract = () => {
      setAuto(false);
      setActive(null);
    };
    s.onPick = (hit) => {
      if (hit) goTo(target.current + (hit === "next" ? 1 : -1));
    };
    s.onContextLost = () => unsupported.current?.();
    s.onContextRestored = () => {
      // Видеопамять очищена: текстуры нужно сделать заново.
      have.current.clear();
      setJobs([]);
      setSlot((v) => v);
    };
    const ro = new ResizeObserver(([entry]) => s.resize(entry.contentRect.width, entry.contentRect.height));
    ro.observe(box);
    s.resize(box.clientWidth, box.clientHeight);
    // Вне экрана и на скрытой вкладке кадры не нужны: цикл засыпает и просыпается по событиям.
    let visible = true;
    const sync = () => s.setActive(visible && !document.hidden);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    io.observe(box);
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      io.disconnect();
      ro.disconnect();
      s.dispose();
      scene.current = null;
    };
  }, [dims, count, M, goTo]);

  // ── Текстуры: нужны обложка и страницы возле читаемой; остальное освобождаем ──
  const wanted = useMemo(() => {
    const keys: FaceKey[] = ["front", "back", "spine"];
    if (!ctx) return keys;
    const lo = Math.max(1, slot - KEEP);
    const hi = Math.min(M, slot + KEEP);
    const order: FaceKey[] = [];
    for (let i = lo; i <= hi; i++) order.push(`leaf:${i}:f`, `leaf:${i}:b`);
    // Сначала то, что видно на развороте: оборот листа слева и лицо листа справа, потом соседние.
    const dist = (k: FaceKey) => Math.abs(Number(k.split(":")[1]) - (slot + (k.endsWith(":b") ? -1 : 0)));
    order.sort((a, b) => dist(a) - dist(b));
    return [...keys, ...order];
  }, [ctx, slot, M]);

  const nodeFor = useCallback(
    (key: FaceKey): RasterJob | null => {
      const title = data.cover.title || data.title;
      if (key === "front")
        return { key, version: artVersion, width: texW, height: boardH, pixelRatio: 1.5, node: <CoverFrontFace template={template} art={art} title={data.cover.title} subtitle={data.cover.subtitle} names={data.cover.names} titlePlaceholder={data.cover.titlePlaceholder} width={texW} height={boardH} widthMm={dims.w} /> };
      if (key === "back") return { key, version: artVersion, width: texW, height: boardH, pixelRatio: 1.5, node: <CoverBackFace art={art} design={backDesign} photos={backPhotos} brand={brand} width={texW} height={boardH} widthMm={dims.w} heightMm={dims.h} /> };
      if (key === "spine") return { key, version: artVersion, width: spineW, height: boardH, pixelRatio: 2, node: <CoverSpineFace template={template} art={art} title={title} names={data.cover.names} width={spineW} height={boardH} widthMm={dims.d} heightMm={dims.h} /> };
      if (!ctx) return null;
      const [, index, side] = key.split(":");
      const sheet = sheets[Number(index)];
      if (!sheet || sheet.kind !== "pages") return null;
      const face = side === "f" ? sheet.front : sheet.back;
      const no = side === "f" ? sheet.frontNo : sheet.backNo;
      // У корешка страница темнеет (складка) — это запекаем в текстуру: сцена считает свет, но не тень в сгибе.
      const gutter = side === "f" ? "right" : "left";
      const node: ReactNode = (
        <div style={{ position: "relative", width: texW, height: pageH }}>
          <FaceView face={face} no={no} ctx={ctx} />
          <div aria-hidden style={{ position: "absolute", inset: 0, background: `linear-gradient(to ${gutter}, rgba(0,0,0,.22), rgba(0,0,0,.05) 7%, rgba(0,0,0,0) 18%)` }} />
        </div>
      );
      return { key, width: texW, height: pageH, node };
    },
    [art, artVersion, backDesign, backPhotos, boardH, brand, ctx, data.cover.names, data.cover.subtitle, data.cover.title, data.cover.titlePlaceholder, data.title, dims, pageH, sheets, spineW, template, texW],
  );

  // Версия арта, для которой текстуры обложки уже учтены как готовые.
  const coverVersion = useRef(artVersion);
  useEffect(() => {
    const s = scene.current;
    if (!s) return;
    // Фото обложки догрузились — текстуры обложки, снятые с заглушкой, устарели: снимаем заново.
    if (coverVersion.current !== artVersion) {
      coverVersion.current = artVersion;
      for (const k of ["front", "back", "spine"] as const) have.current.delete(k);
    }
    // Освобождаем текстуры дальних листов (память и видеопамять), оставляя обложку и окно вокруг страницы.
    const keep = new Set<FaceKey>(wanted);
    for (const key of s.textureKeys()) {
      if (!keep.has(key)) {
        s.setTexture(key, null);
        have.current.delete(key);
      }
    }
    const missing = wanted.filter((k) => !have.current.has(k));
    const next = missing.flatMap((k) => nodeFor(k) ?? []);
    setJobs((prev) => (prev.length === next.length && prev.every((j, i) => j.key === next[i].key && j.version === next[i].version) ? prev : next));
  }, [wanted, nodeFor, count, artVersion]);

  const onRasterDone = useCallback((key: string, source: HTMLCanvasElement, version?: string) => {
    const s = scene.current;
    const k = key as FaceKey;
    if (s) {
      s.setTexture(k, source);
      // Снимок старой версии (пока шло фото) ставим как временный, но готовым не считаем — следом придёт новый.
      if (!version || version === coverVersion.current) have.current.add(k);
      if (k === "front") {
        const color = averageColor(source);
        if (color) s.setEdgeColor(color);
        setReady(true);
      }
    }
    setJobs((prev) => prev.filter((j) => j.key !== key));
  }, []);

  // ── Управление ──
  const orbitBy = (d: number) => {
    const s = scene.current;
    if (!s) return;
    const v = s.getView();
    s.setView({ azimuth: v.azimuth + d }, 280);
  };
  const stopAuto = () => {
    scene.current?.setAutoRotate(false);
    setAuto(false);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const s = scene.current;
    if (!s) return;
    const orbit = e.shiftKey;
    const actions: Record<string, () => void> = {
      ArrowRight: () => (orbit ? orbitBy(0.17) : goTo(target.current + 1)),
      ArrowLeft: () => (orbit ? orbitBy(-0.17) : goTo(target.current - 1)),
      ArrowUp: () => s.setView({ polar: s.getView().polar - 0.15 }, 280),
      ArrowDown: () => s.setView({ polar: s.getView().polar + 0.15 }, 280),
      PageDown: () => goTo(target.current + 1),
      PageUp: () => goTo(target.current - 1),
      Home: () => goTo(0),
      End: () => goTo(countRef.current - 1),
      "+": () => s.zoomBy(1.25),
      "=": () => s.zoomBy(1.25),
      "-": () => s.zoomBy(1 / 1.25),
      "0": () => {
        s.setView({ ...INITIAL, distance: s.baseDistance }, 700);
        setActive("front");
      },
    };
    const run = actions[e.key];
    if (!run) return;
    e.preventDefault();
    stopAuto();
    run();
  };

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

  const spread = count ? visibleSpread(slot, count) : { left: null, right: null };
  const label = !count ? f.loading : slot === 0 ? f.cover : slot === count - 1 ? f.backCover : f.pages(spread.left, spread.right);

  return (
    <div ref={wrapper} className={cn("flex flex-col items-center gap-4", full && "justify-center bg-paper p-4", className)}>
      {measure}
      <RasterHost jobs={jobs} onDone={onRasterDone} onError={(key, e) => console.warn("book texture failed", key, e)} />
      <div
        ref={stage}
        role="group"
        aria-label={mm.group}
        aria-roledescription="3D"
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="relative w-full overflow-hidden rounded-3xl bg-[radial-gradient(ellipse_at_50%_35%,#fffdf9,#efe7da_72%)] focus-visible:outline-offset-4"
        style={full ? { height: "calc(100dvh - 12rem)" } : { maxWidth: "48rem", aspectRatio: "5 / 4" }}
      >
        <canvas ref={canvas} className="absolute inset-0 block size-full cursor-grab touch-none active:cursor-grabbing" />
        {/* Лёгкая виньетка: взгляд уходит к книге, края студии мягко темнеют */}
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 44%, transparent 56%, rgba(72,50,26,.16) 100%)" }} />
        {!ready ? <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted">{f.loading}</div> : null}
      </div>
      <ViewerControls
        count={count}
        slot={slot}
        label={label}
        active={active}
        auto={auto}
        canFull={canFull}
        full={full}
        aperture={{
          value: aperture,
          min: APERTURE.min,
          max: APERTURE.max,
          label: `${apertureDegrees(aperture)}°`,
          disabled: slot === 0,
          onChange: (v) => {
            apertureRef.current = v;
            setAperture(v);
            scene.current?.setAperture(v);
          },
        }}
        dimsText={mm.dims(Math.round(format.widthMm), Math.round(format.heightMm), Math.round(dims.d * 10) / 10, pageCount)}
        onPrev={() => {
          stopAuto();
          goTo(target.current - 1);
        }}
        onNext={() => {
          stopAuto();
          goTo(target.current + 1);
        }}
        onSeek={(n) => {
          stopAuto();
          goTo(n);
        }}
        onView={(id) => {
          stopAuto();
          const s = scene.current;
          if (s) s.setView({ ...VIEW_ANGLES[id], distance: s.baseDistance }, 750);
          setActive(id);
        }}
        onRead={() => {
          stopAuto();
          const s = scene.current;
          if (!s) return;
          if (s.position < 0.5) goTo(1);
          s.setView({ azimuth: READ.azimuth, polar: READ.polar, distance: s.baseDistance / READ.zoom }, 750);
          setActive("read");
        }}
        onZoom={(factor) => {
          stopAuto();
          scene.current?.zoomBy(factor);
        }}
        onAuto={() => {
          const next = !auto;
          scene.current?.setAutoRotate(next);
          setAuto(next);
        }}
        onReset={() => {
          stopAuto();
          const s = scene.current;
          if (s) s.setView({ ...INITIAL, distance: s.baseDistance }, 750);
          setActive("front");
        }}
        onFull={() => {
          if (document.fullscreenElement) void document.exitFullscreen();
          else void wrapper.current?.requestFullscreen();
        }}
      />
    </div>
  );
}
