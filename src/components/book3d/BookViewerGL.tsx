"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useMessages } from "@/i18n/client";
import { designBack } from "@/lib/book/cover-back";
import { getCoverTemplate } from "@/lib/book/covers";
import { parseCoverDesign, templateForDesign } from "@/lib/book/cover-design";
import { getFormat } from "@/lib/book/formats";
import { APERTURE, apertureDegrees, bookDims, clamp } from "@/lib/book/book-model";
import { leafCount, pageLeaf, pagesNear, sheetCount, visibleSpread } from "@/lib/book/flipbook";
import { cn } from "@/lib/class-names";
import { BuildNotice, BuildPlaceholder, leafImage, leafImageWidth, NEAR_SPREADS, useFlipbookPages, type FlipbookData } from "./pages";
import { photoHref, type PhotoRef } from "@/lib/book/covers/svg-kit";
import { buildCoverArt } from "./cover-art";
import { useCoverImage, useCoverSamples } from "./useCoverImage";
import { ViewerControls, type ViewId } from "./ViewerControls";
import { useBookKeys, useFullscreen } from "./hooks";
import { RasterHost, type RasterJob } from "./webgl/RasterHost";
import { CoverBackFace, CoverFrontFace, CoverSpineFace } from "./webgl/cover-faces";
import { BookScene, type FaceKey } from "./webgl/BookScene";
import { fetchBitmap, PageTextures, type PageFailure } from "./webgl/page-textures";

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
const COVER_KEYS = ["front", "back", "spine"] as const;
/** Сколько ждём снимки обложки (фото, снимки-примеры), прежде чем снять обложку с тем, что есть. */
const ART_WAIT_MS = 6000;
/**
 * Окно загрузки полос передаём загрузчику с задержкой: ползунок и быстрое листание меняют цель много раз в секунду,
 * а каждый запрос картинки, пока его не отменили, — растр на сервере, общий для всех.
 */
const WINDOW_DELAY_MS = 120;

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
 * картинки полос экранной сборки, того же PDF, что уйдёт в типографию; грузятся только для разворотов возле
 * читаемого. Обложка — вёрстка переплёта, растеризованная в текстуры (RasterHost).
 */
export function BookViewerGL({ data, bookId, onUnsupported, className }: { data: FlipbookData; bookId: string; onUnsupported?: () => void; className?: string }) {
  const m = useMessages().books.preview;
  const f = m.flip;
  const mm = m.model;
  const format = getFormat(data.formatId);
  // Обложка из конструктора: слои на лице; корешок и оборот — по шаблону (со своим фоном — контрастным цветом).
  const design = useMemo(() => (data.cover.design ? parseCoverDesign(data.cover.design) : null), [data.cover.design]);
  const template = useMemo(() => templateForDesign(getCoverTemplate(data.cover.template), design), [data.cover.template, design]);
  const { brand, back, backPhotos } = data.model;
  const pages = useFlipbookPages(bookId);
  const { build } = pages;
  // Пока сборки нет, книгу не строим (заглушка): толщина корешка и число листов — по её полосам.
  const pageCount = build?.pageCount ?? 0;
  const count = build ? sheetCount(pageCount) : 0;
  /** Листов блока между обложкой и задней крышкой. */
  const M = leafCount(pageCount);
  const dims = useMemo(() => bookDims(format, pageCount), [format, pageCount]);
  const backDesign = useMemo(() => designBack(template, dims.w, dims.h, back), [template, dims, back]);

  // Размер текстуры: на телефонах поменьше, чтобы уложиться в память.
  const texW = useMemo(() => (typeof window !== "undefined" && Math.min(window.innerWidth, window.innerHeight) < 700 ? 768 : 1024), []);
  const imageW = useMemo(() => leafImageWidth(), []);
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
  const samples = useCoverSamples(template);
  // Фото, снимок обложки и снимки-примеры приходят позже первой отрисовки: по этой версии пересоздаём текстуры обложки.
  const artVersion = `${template.id}:${design ? hash(JSON.stringify(design)) : "-"}:${photoHrefs ? photoHrefs.map((h) => (h ? 1 : 0)).join("") : "-"}:${hash(photoKey)}:${imageHref ? 1 : 0}:${samples ? 1 : 0}:${backDesign.plainArt ? 1 : 0}`;
  const art = useMemo(() => buildCoverArt(template, format, pageCount, dims, { photos: photoHrefs, imageHref, plainBack: backDesign.plainArt, samples, design }), [template, format, pageCount, dims, photoHrefs, imageHref, backDesign.plainArt, samples, design]);
  // Пока снимки обложки ещё грузятся, растеризация даёт пустую (чёрную) текстуру: до их прихода обложку не снимаем,
  // а на случай медленной сети или сбоя ждём не дольше нескольких секунд — потом рисуем с тем, что есть.
  const pendingArt = (!!template.photo && !imageHref) || (!!template.samples && !samples) || (template.requiresPhoto && !!data.cover.photos?.some(Boolean) && !photoHrefs);
  const [waitedFor, setWaitedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!pendingArt) return;
    const t = setTimeout(() => setWaitedFor(template.id), ART_WAIT_MS);
    return () => clearTimeout(t);
  }, [pendingArt, template.id]);
  const coverReady = !pendingArt || waitedFor === template.id;

  const wrapper = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  const scene = useRef<BookScene | null>(null);
  const pageTextures = useRef<PageTextures<FaceKey, ImageBitmap> | null>(null);
  const countRef = useRef(count);
  const target = useRef(0);
  const slotRef = useRef(0);
  const have = useRef(new Set<FaceKey>());
  const [slot, setSlot] = useState(0);
  // Куда листаем и откуда: окно загрузки — у цели (и у начала, пока лист летит), а не у каждой полосы по пути.
  const [dest, setDest] = useState(0);
  const origin = useRef(0);
  // Сцена пересоздаётся, когда новая сборка с другим числом полос: ракурс, приближение и вращение переносим в новую.
  const savedView = useRef<{ azimuth: number; polar: number; zoom: number } | null>(null);
  // Снятые стороны обложки и цвет кромки: новая сцена сразу ставит их, пока растеризация не сняла заново.
  const coverShots = useRef(new Map<FaceKey, HTMLCanvasElement>());
  const edgeColor = useRef<string | null>(null);
  // Картинки полос этой сборки не грузятся и после повторов — строка с повтором поверх книги.
  const [failedFp, setFailedFp] = useState<string | null>(null);
  const recover = useRef(pages.recover);
  const [auto, setAuto] = useState(() => !prefersReducedMotion());
  const autoRef = useRef(auto);
  const [active, setActive] = useState<string | null>("front");
  const [jobs, setJobs] = useState<RasterJob[]>([]);
  const [ready, setReady] = useState(false);
  const [aperture, setAperture] = useState<number>(APERTURE.default);
  const apertureRef = useRef<number>(APERTURE.default);
  const unsupported = useRef(onUnsupported);
  useEffect(() => {
    countRef.current = count;
    unsupported.current = onUnsupported;
    autoRef.current = auto;
    recover.current = pages.recover;
  });

  /** Листает к позиции n; открывая закрытую книгу, разворачивает её к читателю. */
  const goTo = useCallback((n: number) => {
    const s = scene.current;
    if (!s) return;
    const to = Math.round(clamp(n, 0, Math.max(0, countRef.current - 1)));
    const from = s.position;
    target.current = to;
    origin.current = Math.round(from);
    setDest(to);
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
    const host = canvasHost.current;
    const box = stage.current;
    if (!host || !box || !count) return;
    // Холст у каждой сцены свой: закрываясь, сцена теряет контекст WebGL (освобождает видеопамять), и на старом
    // холсте новый контекст уже не получить — а новая сборка с другим числом полос пересоздаёт сцену.
    const el = document.createElement("canvas");
    el.className = "absolute inset-0 block size-full cursor-grab touch-none active:cursor-grabbing";
    host.append(el);
    let s: BookScene;
    try {
      s = new BookScene({ canvas: el, dims, leaves: M, reducedMotion: prefersReducedMotion() });
    } catch {
      el.remove();
      unsupported.current?.();
      return;
    }
    scene.current = s;
    have.current.clear();
    // Не загрузилась полоса — сборку, может, заменили (и прошлую удалили): переспрашиваем; совсем не грузится — строка.
    const onFailure = (f: PageFailure<FaceKey>) => {
      recover.current?.();
      if (f.final) setFailedFp(f.id.split(":")[0]);
    };
    const textures = new PageTextures<FaceKey, ImageBitmap>((key, image) => s.setTexture(key, image), fetchBitmap, undefined, onFailure);
    pageTextures.current = textures;
    s.setAperture(apertureRef.current);
    s.setPosition(target.current);
    // Пересоздана (другое число полос): тот же ракурс и приближение, вращение — как на кнопке, обложка — прежняя до новой.
    const saved = savedView.current;
    if (saved) s.setView({ azimuth: saved.azimuth, polar: saved.polar, distance: s.baseDistance * saved.zoom }, 0);
    s.setAutoRotate(autoRef.current);
    for (const [key, shot] of coverShots.current) s.setTexture(key, shot);
    if (edgeColor.current) s.setEdgeColor(edgeColor.current);
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
      textures.reset();
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
      const v = s.getView();
      savedView.current = { azimuth: v.azimuth, polar: v.polar, zoom: v.distance / s.baseDistance };
      document.removeEventListener("visibilitychange", sync);
      io.disconnect();
      ro.disconnect();
      textures.dispose();
      pageTextures.current = null;
      s.dispose();
      el.remove();
      scene.current = null;
    };
  }, [dims, count, M, goTo]);

  // ── Полосы: картинки сборки для разворотов у цели листания; ушедшие из окна отменяются и освобождаются ──
  const settled = slot === dest;
  useEffect(() => {
    const textures = pageTextures.current;
    if (!textures) return;
    if (!build) {
      textures.want([]);
      return;
    }
    // Пока лист летит, полосы, с которых ушли, ещё видны (и уже загружены) — их держим; промежуточные не грузим вовсе.
    const near = new Set([...pagesNear(dest, build.pageCount, NEAR_SPREADS), ...(settled ? [] : pagesNear(origin.current, build.pageCount, NEAR_SPREADS))]);
    const jobs = [...near].map((n) => {
      const { leaf, side } = pageLeaf(n);
      return { key: `leaf:${leaf}:${side}` as const, id: `${build.fp}:${n}`, url: leafImage(build, n, imageW) };
    });
    const id = window.setTimeout(() => textures.want(jobs), WINDOW_DELAY_MS);
    return () => window.clearTimeout(id);
    // Сцена пересоздаётся вместе с dims и count — а с ней и загрузчик: окно нужно передать новому.
  }, [build, dest, settled, imageW, dims, count]);
  const reloadPages = () => {
    setFailedFp(null);
    pageTextures.current?.retryFailed();
  };

  // ── Обложка: стороны переплёта растеризуются из вёрстки ──
  const nodeFor = useCallback(
    (key: (typeof COVER_KEYS)[number]): RasterJob => {
      const title = data.cover.title || data.title;
      if (key === "front")
        return { key, version: artVersion, width: texW, height: boardH, pixelRatio: 1.5, node: <CoverFrontFace template={template} art={art} title={data.cover.title} subtitle={data.cover.subtitle} names={data.cover.names} titlePlaceholder={data.cover.titlePlaceholder} width={texW} height={boardH} widthMm={dims.w} design={design} format={data.formatId} /> };
      if (key === "back") return { key, version: artVersion, width: texW, height: boardH, pixelRatio: 1.5, node: <CoverBackFace art={art} design={backDesign} photos={backPhotos} brand={brand} width={texW} height={boardH} widthMm={dims.w} heightMm={dims.h} /> };
      return { key, version: artVersion, width: spineW, height: boardH, pixelRatio: 2, node: <CoverSpineFace template={template} art={art} title={title} names={data.cover.names} width={spineW} height={boardH} widthMm={dims.d} heightMm={dims.h} /> };
    },
    [art, artVersion, backDesign, backPhotos, boardH, brand, data.cover.names, data.cover.subtitle, data.cover.title, data.cover.titlePlaceholder, data.title, dims, spineW, template, texW, design, data.formatId],
  );

  // Версия арта, для которой текстуры обложки уже учтены как готовые.
  const coverVersion = useRef(artVersion);
  useEffect(() => {
    if (!scene.current) return;
    // Фото обложки догрузились — текстуры обложки, снятые с заглушкой, устарели: снимаем заново.
    if (coverVersion.current !== artVersion) {
      coverVersion.current = artVersion;
      for (const k of COVER_KEYS) have.current.delete(k);
    }
    const next = coverReady ? COVER_KEYS.filter((k) => !have.current.has(k)).map(nodeFor) : [];
    setJobs((prev) => (prev.length === next.length && prev.every((j, i) => j.key === next[i].key && j.version === next[i].version) ? prev : next));
  }, [nodeFor, count, artVersion, coverReady]);

  const onRasterDone = useCallback((key: string, source: HTMLCanvasElement, version?: string) => {
    const s = scene.current;
    const k = key as FaceKey;
    if (s) {
      s.setTexture(k, source);
      coverShots.current.set(k, source);
      // Снимок старой версии (пока шло фото) ставим как временный, но готовым не считаем — следом придёт новый.
      if (!version || version === coverVersion.current) have.current.add(k);
      if (k === "front") {
        const color = averageColor(source);
        if (color) {
          edgeColor.current = color;
          s.setEdgeColor(color);
        }
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
  const keys = useBookKeys({
    turn: (step) => goTo(target.current + step),
    edge: (to) => goTo(to === "first" ? 0 : countRef.current - 1),
    orbit: (dir) => orbitBy(0.17 * dir),
    // ↑ — выше над книгой: полярный угол меньше.
    tilt: (dir) => {
      const s = scene.current;
      if (s) s.setView({ polar: s.getView().polar - 0.15 * dir }, 280);
    },
    zoom: (dir) => scene.current?.zoomBy(dir > 0 ? 1.25 : 1 / 1.25),
    reset: () => {
      const s = scene.current;
      if (!s) return;
      s.setView({ ...INITIAL, distance: s.baseDistance }, 700);
      setActive("front");
    },
    before: stopAuto,
  });
  // Пока сцена не создана, клавиши не перехватываем.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (scene.current) keys(e);
  };

  // ── Полный экран ──
  const { canFull, full, toggleFull } = useFullscreen(wrapper);

  const spread = count ? visibleSpread(slot, count) : { left: null, right: null };
  const label = !count ? f.loading : slot === 0 ? f.cover : slot === count - 1 ? f.backCover : f.pages(spread.left, spread.right);

  return (
    <div ref={wrapper} className={cn("flex flex-col items-center gap-4", full && "justify-center bg-paper p-4", className)}>
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
        <div ref={canvasHost} className="absolute inset-0" />
        {/* Лёгкая виньетка: взгляд уходит к книге, края студии мягко темнеют */}
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 44%, transparent 56%, rgba(72,50,26,.16) 100%)" }} />
        {!build ? <BuildPlaceholder pages={pages} /> : !ready ? <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted">{f.loading}</div> : null}
        <BuildNotice pages={{ ...pages, pagesFailed: !!build && failedFp === build.fp }} onReloadPages={reloadPages} />
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
        dimsText={build ? mm.dims(Math.round(format.widthMm), Math.round(format.heightMm), Math.round(dims.d * 10) / 10, pageCount) : ""}
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
        onFull={toggleFull}
      />
    </div>
  );
}
