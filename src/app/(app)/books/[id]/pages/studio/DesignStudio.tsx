"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Redo2, RotateCcw, Undo2 } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { confirmDialog } from "@/components/ui/overlays";
import { InteriorSpread, type SpreadKind, type SpreadSample } from "@/components/interior/InteriorSpread";
import type { BookFormat } from "@/lib/book/formats";
import { applyInteriorStyle, getInteriorDesign, isInteriorId, parseInteriorStyle, type InteriorDesign, type InteriorId, type InteriorStyle } from "@/lib/book/interiors";
import { applyPagesOps } from "@/lib/book/design-ai/ops";
import { cn } from "@/lib/class-names";
import { DesignAiPanel } from "@/components/design/DesignAiPanel";
import { ChaptersTab, type StudioChapter } from "./ChaptersTab";
import { ColorsTab } from "./ColorsTab";
import { ElementsTab } from "./ElementsTab";
import { FontsTab } from "./FontsTab";
import { StylesTab } from "./StylesTab";
import { TextTab } from "./TextTab";
import { countCustom, resetStyle } from "./style-edit";

export type StudioTabId = "ai" | "styles" | "fonts" | "text" | "elements" | "colors" | "chapters";
export const STUDIO_TABS: StudioTabId[] = ["ai", "styles", "fonts", "text", "elements", "colors", "chapters"];

interface Snapshot {
  interior: InteriorId;
  style: InteriorStyle;
}

/** Правки ползунком подряд (чаще, чем раз в полсекунды) — один шаг отмены. */
const COALESCE_MS = 500;
const HISTORY_MAX = 80;

/**
 * Студия оформления страниц: библиотека стилей и настройки поверх выбранного — шрифты по ролям, текст, элементы,
 * цвета и отдельные главы. Отмена и возврат правок, сброс к стилю. Изменения сразу видны на развороте (родитель
 * показывает его по base + style) и сохраняются автосохранением.
 */
export function DesignStudio({
  bookId,
  interior,
  base,
  design,
  style,
  onChange,
  format,
  sample,
  cover,
  chapters,
  editable,
  onPreview,
  openersLeft,
  onOpenersLeft,
  tab,
  chapter,
  onChapter,
  historySlots,
}: {
  bookId: string;
  interior: InteriorId;
  /** Стиль из каталога и он же с настройками. */
  base: InteriorDesign;
  design: InteriorDesign;
  style: InteriorStyle;
  onChange: (next: { interior?: InteriorId; interiorStyle?: InteriorStyle }) => void;
  format: BookFormat;
  sample: SpreadSample;
  cover: { name: string; pairs: InteriorId[] };
  chapters: StudioChapter[];
  editable: boolean;
  /** Какой разворот показать (и какую главу — для вкладки «Главы»). */
  onPreview: (kind: SpreadKind, chapterKey?: string | null) => void;
  /** «Глава всегда с левой страницы» (вкладка «Элементы»): настройка книги, вне отмены правок стиля. */
  openersLeft: boolean;
  onOpenersLeft: (v: boolean) => void;
  /** Открытая вкладка и глава для вкладки «Главы»: их держит страница — вкладки лежат в панели рядом (и в листе на телефоне). */
  tab: StudioTabId;
  chapter: string | null;
  onChapter: (key: string) => void;
  /** Куда вынести «Отменить» и «Повторить»: концы лент вкладок (компьютер и телефон). Нет места — кнопки стоят в самой панели. */
  historySlots?: (HTMLElement | null)[];
}) {
  const m = useMessages().design;
  const t = m.pages;
  const [history, setHistory] = useState<{ past: Snapshot[]; future: Snapshot[] }>({ past: [], future: [] });
  const lastPush = useRef(0);
  const [kept, setKept] = useState<InteriorStyle | null>(null);

  const commit = (next: Snapshot, coalesce = true) => {
    if (!editable) return;
    const now = Date.now();
    const push = !coalesce || now - lastPush.current > COALESCE_MS || !history.past.length;
    lastPush.current = now;
    setHistory((h) => ({ past: push ? [...h.past.slice(-HISTORY_MAX + 1), { interior, style }] : h.past, future: [] }));
    onChange({ interior: next.interior, interiorStyle: next.style });
  };
  const setStyle = (next: InteriorStyle) => commit({ interior, style: next });
  const undo = () => {
    const prev = history.past.at(-1);
    if (!prev) return;
    lastPush.current = 0;
    setHistory((h) => ({ past: h.past.slice(0, -1), future: [...h.future, { interior, style }] }));
    onChange({ interior: prev.interior, interiorStyle: prev.style });
  };
  const redo = () => {
    const next = history.future.at(-1);
    if (!next) return;
    lastPush.current = 0;
    setHistory((h) => ({ past: [...h.past, { interior, style }], future: h.future.slice(0, -1) }));
    onChange({ interior: next.interior, interiorStyle: next.style });
  };
  const pickStyle = (id: InteriorId) => {
    if (id === interior) return;
    // Свои шрифты и интервалы подбирались к прежнему стилю — новый показываем как он задуман, с возможностью вернуть.
    const custom = countCustom(style) > 0;
    commit({ interior: id, style: custom ? resetStyle(style) : style }, false);
    setKept(custom ? style : null);
    onPreview("chapter");
  };
  const custom = countCustom(style);
  // Слоты заданы — кнопки истории в них (пока слотов ещё нет в разметке, не показываем нигде, чтобы они не «перепрыгивали»).
  const slotMode = historySlots !== undefined;
  const slots = (historySlots ?? []).filter((el): el is HTMLElement => !!el);
  const historyButtons = (
    <>
      <button type="button" onClick={undo} disabled={!history.past.length || !editable} title={t.undo} aria-label={t.undo} className="btn btn-ghost btn-sm btn-icon disabled:opacity-30">
        <Undo2 className="size-4" />
      </button>
      <button type="button" onClick={redo} disabled={!history.future.length || !editable} title={t.redo} aria-label={t.redo} className="btn btn-ghost btn-sm btn-icon disabled:opacity-30">
        <Redo2 className="size-4" />
      </button>
    </>
  );
  const focus = (kind: SpreadKind) => onPreview(kind, tab === "chapters" ? chapter : null);

  return (
    <section aria-label={t.title}>
      {slots.map((el, i) => (el ? createPortal(historyButtons, el, `h${i}`) : null))}
      {!slotMode || custom ? (
        <div className="mb-3 flex min-h-9 items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs text-muted">{custom ? t.customized(custom) : ""}</span>
          <div className="flex shrink-0 items-center gap-1">
            {!slotMode ? historyButtons : null}
            {custom ? (
              <button
                type="button"
                disabled={!editable}
                onClick={async () => {
                  if (await confirmDialog({ title: t.resetAll, text: t.resetAllConfirm })) setStyle(resetStyle(style));
                }}
                className="btn btn-ghost btn-sm"
              >
                <RotateCcw className="size-3.5" /> <span className="max-sm:sr-only">{t.resetAll}</span>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {kept ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-[var(--r-panel)] bg-rose/60 px-3.5 py-3 text-sm text-ink-soft">
          <span>{t.styles.keptNotice}</span>
          <button
            type="button"
            className="font-medium text-wine hover:underline"
            onClick={() => {
              setStyle(kept);
              setKept(null);
            }}
          >
            {t.styles.keepMine}
          </button>
        </div>
      ) : null}

      <div role="tabpanel" className={cn(!editable && "pointer-events-none opacity-60")}>
        {tab === "ai" ? (
          <DesignAiPanel
            bookId={bookId}
            target="pages"
            editable={editable}
            payload={() => ({ state: { interior, style }, chapters: chapters.map((c) => ({ key: c.key, title: c.title.slice(0, 120) })) })}
            onApply={(patch) => {
              if (!patch.interior || !isInteriorId(patch.interior) || !patch.interiorStyle) return;
              commit({ interior: patch.interior, style: parseInteriorStyle(patch.interiorStyle) }, false);
              setKept(null);
              onPreview("chapter");
            }}
            applyOps={(ops) => {
              const r = applyPagesOps({ interior, style }, ops);
              if (JSON.stringify(r.state) === JSON.stringify({ interior, style })) return false;
              commit(r.state, false);
              onPreview("chapter");
              return true;
            }}
            renderPreview={(patch) =>
              patch.interior && isInteriorId(patch.interior) ? (
                <InteriorSpread design={applyInteriorStyle(getInteriorDesign(patch.interior), parseInteriorStyle(patch.interiorStyle ?? {}))} format={format} sample={sample} kind="chapter" className="rounded-[3px]" />
              ) : null
            }
            previewMin={220}
            onUndo={undo}
          />
        ) : null}
        {tab === "styles" ? <StylesTab current={interior} format={format} sample={sample} pairs={cover.pairs} coverName={cover.name} editable={editable} onPick={pickStyle} /> : null}
        {tab === "fonts" ? <FontsTab design={design} style={style} set={setStyle} sample={sample.title} onFocus={focus} /> : null}
        {tab === "text" ? <TextTab design={design} style={style} set={setStyle} onFocus={focus} /> : null}
        {tab === "elements" ? <ElementsTab design={design} style={style} set={setStyle} onFocus={focus} openersLeft={openersLeft} onOpenersLeft={onOpenersLeft} /> : null}
        {tab === "colors" ? <ColorsTab design={design} base={base} style={style} set={setStyle} onFocus={focus} /> : null}
        {tab === "chapters" ? (
          <ChaptersTab
            chapters={chapters}
            selected={chapter}
            onSelect={(k) => {
              onChapter(k);
              onPreview("chapter", k);
            }}
            design={design}
            style={style}
            set={setStyle}
          />
        ) : null}
      </div>
    </section>
  );
}
