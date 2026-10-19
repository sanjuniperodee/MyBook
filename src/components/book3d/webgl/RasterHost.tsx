"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { toCanvas } from "html-to-image";

/** Что нужно превратить в картинку: вёрстка страницы в пикселях заданного размера. */
export interface RasterJob {
  key: string;
  /** Версия содержимого: сменилась (например, догрузились фото) — задание снимается заново, хотя ключ тот же. */
  version?: string;
  width: number;
  height: number;
  /** Плотность пикселей именно для этого задания (обложке нужна выше, чем странице); по умолчанию — общая. */
  pixelRatio?: number;
  node: ReactNode;
}

/** Идентификатор «ключ + версия»: по нему различаем, снято ли задание в его нынешнем виде. */
const jobId = (j: Pick<RasterJob, "key" | "version">) => (j.version ? `${j.key}@${j.version}` : j.key);

const isSafari = () => typeof navigator !== "undefined" && /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

/** Ждёт, пока браузер догрузит шрифты и закончит раскладку, — иначе в текстуру попадёт запасной шрифт. */
async function ready() {
  await document.fonts?.ready;
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

/** Пример текста для загрузки шрифта: латиница, кириллица и казахские буквы («Aa», «Бб», «Ққ») — без них браузер может загрузить не тот поднабор. */
const SAMPLE_TEXT = "Aa\u0411\u0431\u049a\u049b";

const dataUrlCache = new Map<string, Promise<string>>();
const embedCache = new Map<string, Promise<string>>();

function toDataUrl(url: string): Promise<string> {
  let p = dataUrlCache.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`font ${r.status}`);
        return r.blob();
      })
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          }),
      );
    dataUrlCache.set(url, p);
  }
  return p;
}

const normalizeFamily = (f: string) => f.trim().replace(/["']/g, "");

/**
 * @font-face для тех семейств, что реально стоят в вёрстке, с файлами шрифтов внутри (data-URL): в картинку из
 * SVG внешние файлы не подгружаются. Встроенный в html-to-image подбор не годится: он смотрит на инлайновый
 * font-family, а у нас там `var(--font-…)`, и шрифты, заданные переменными, остаются за бортом.
 */
async function fontCssFor(root: HTMLElement): Promise<string> {
  const used = new Set<string>();
  const visit = (el: Element) => {
    getComputedStyle(el).fontFamily.split(",").forEach((f) => used.add(normalizeFamily(f)));
    for (const child of Array.from(el.children)) visit(child);
  };
  visit(root);
  const key = [...used].sort().join("|");
  let css = embedCache.get(key);
  if (!css) {
    css = (async () => {
      const out: Promise<string>[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try {
          rules = sheet.cssRules;
        } catch {
          continue; // чужая таблица стилей недоступна для чтения — у неё и шрифтов нашей вёрстки нет
        }
        for (const rule of Array.from(rules)) {
          if (!(rule instanceof CSSFontFaceRule) || !used.has(normalizeFamily(rule.style.getPropertyValue("font-family")))) continue;
          const base = sheet.href ?? location.href;
          const text = rule.cssText;
          if (!/url\(/.test(text)) continue;
          out.push(
            (async () => {
              let result = text;
              for (const match of text.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
                if (match[1].startsWith("data:")) continue;
                result = result.replace(match[0], `url(${await toDataUrl(new URL(match[1], base).href)})`);
              }
              return result;
            })(),
          );
        }
      }
      return (await Promise.all(out)).join("\n");
    })();
    embedCache.set(key, css);
  }
  return css;
}

/**
 * Догружает шрифты, которые реально использует вёрстка. Браузер грузит веб-шрифт лениво — только когда текст уже
 * показан, а html-to-image замораживает вычисленные размеры блоков: измеренные запасным шрифтом, они не вместят
 * настоящий, и строки перекроют друг друга. Поэтому сначала грузим шрифты, потом даём раскладке пересчитаться.
 */
async function loadFontsUsedBy(root: HTMLElement) {
  const wanted = new Set<string>();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent?.trim() || !n.parentElement) continue;
    const cs = getComputedStyle(n.parentElement);
    wanted.add(`${cs.fontStyle} ${cs.fontWeight} 16px ${cs.fontFamily}`);
  }
  await Promise.all([...wanted].map((font) => document.fonts.load(font, SAMPLE_TEXT).catch(() => [])));
  await document.fonts.ready;
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

/**
 * Невидимая «типография»: вёрстка страниц рисуется HTML-компонентами проекта (те же шрифты и оформление, что в PDF),
 * а затем по очереди превращается в холст — из холстов делаются текстуры WebGL.
 * Задания обрабатываются по одному в порядке списка: сначала то, что ближе к читаемой странице.
 */
export function RasterHost({ jobs, pixelRatio = 1, onDone, onError }: { jobs: RasterJob[]; pixelRatio?: number; onDone: (key: string, canvas: HTMLCanvasElement, version?: string) => void; onError?: (key: string, error: unknown) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const latest = useRef({ jobs, onDone, onError, pixelRatio });
  const state = useRef({ busy: false, again: false, mounted: true, failed: new Set<string>(), done: new Set<string>() });

  const pump = useRef(async () => {});
  useEffect(() => {
    pump.current = async () => {
      const st = state.current;
      // Родитель отдаёт новый список при каждой отрисовке: пока цикл занят, просим его пройтись ещё раз.
      if (st.busy) {
        st.again = true;
        return;
      }
      st.busy = true;
      try {
        await ready();
        do {
          st.again = false;
          for (;;) {
            const { jobs: queue, onDone: done, onError: fail, pixelRatio: ratio } = latest.current;
            // Готовое задание остаётся в списке, пока родитель не перерисуется: второй раз его снимать нельзя (разметки уже нет).
            const job = queue.find((j) => !st.failed.has(jobId(j)) && !st.done.has(jobId(j)));
            if (!job || !st.mounted) break;
            const el = root.current?.querySelector<HTMLElement>(`[data-raster="${CSS.escape(job.key)}"]`);
            if (!el) break; // разметка задания ещё не появилась: цикл разбудит следующая отрисовка
            try {
              await loadFontsUsedBy(el);
              const fontEmbedCSS = await fontCssFor(el);
              const options = { width: job.width, height: job.height, pixelRatio: job.pixelRatio ?? ratio, fontEmbedCSS, cacheBust: false };
              // Safari в первый раз отдаёт пустую картинку (картинки и шрифты не успевают) — прогреваем вызовом вхолостую.
              if (isSafari()) await toCanvas(el, options);
              const canvas = await toCanvas(el, options);
              if (!st.mounted) break;
              st.done.add(jobId(job));
              done(job.key, canvas, job.version);
            } catch (e) {
              st.failed.add(jobId(job));
              fail?.(job.key, e);
            }
            // Отдаём браузеру кадр между страницами: интерфейс не должен замирать.
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
          }
        } while (st.again && st.mounted);
      } finally {
        st.busy = false;
      }
    };
  });
  useEffect(() => {
    latest.current = { jobs, onDone, onError, pixelRatio };
    // Ключ, которого в списке больше нет, можно снимать заново, если он когда-нибудь вернётся.
    const keys = new Set(jobs.map(jobId));
    for (const k of state.current.done) if (!keys.has(k)) state.current.done.delete(k);
    for (const k of state.current.failed) if (!keys.has(k)) state.current.failed.delete(k);
    void pump.current();
  }, [jobs, onDone, onError, pixelRatio]);
  useEffect(() => {
    const st = state.current;
    st.mounted = true;
    return () => {
      st.mounted = false;
    };
  }, []);

  return (
    <div ref={root} aria-hidden className="pointer-events-none fixed top-0 -left-[20000px]" style={{ contain: "layout style" }}>
      {jobs.map((j) => (
        <div key={j.key} data-raster={j.key} style={{ position: "relative", width: j.width, height: j.height, overflow: "hidden" }}>
          {j.node}
        </div>
      ))}
    </div>
  );
}
