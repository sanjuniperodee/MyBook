"use client";

import { useRef, useState } from "react";
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

type Tab = "ai" | "styles" | "fonts" | "text" | "elements" | "colors" | "chapters";
const TABS: Tab[] = ["ai", "styles", "fonts", "text", "elements", "colors", "chapters"];

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
}) {
  const m = useMessages().design;
  const t = m.pages;
  const [tab, setTab] = useState<Tab>("styles");
  const [chapter, setChapter] = useState<string | null>(null);
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
  const focus = (kind: SpreadKind) => onPreview(kind, tab === "chapters" ? chapter : null);

  return (
    <section aria-label={t.title}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{t.title}</h2>
        <div className="flex items-center gap-1">
          {custom ? <span className="mr-1 hidden text-xs text-muted sm:inline">{t.customized(custom)}</span> : null}
          <button type="button" onClick={undo} disabled={!history.past.length || !editable} title={t.undo} aria-label={t.undo} className="flex size-9 items-center justify-center rounded-full text-ink hover:bg-ink/5 disabled:opacity-30">
            <Undo2 className="size-4" />
          </button>
          <button type="button" onClick={redo} disabled={!history.future.length || !editable} title={t.redo} aria-label={t.redo} className="flex size-9 items-center justify-center rounded-full text-ink hover:bg-ink/5 disabled:opacity-30">
            <Redo2 className="size-4" />
          </button>
          {custom ? (
            <button
              type="button"
              disabled={!editable}
              onClick={async () => {
                if (await confirmDialog({ title: t.resetAll, text: t.resetAllConfirm })) setStyle(resetStyle(style));
              }}
              className="ml-1 inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-muted hover:bg-ink/5 hover:text-ink"
            >
              <RotateCcw className="size-3.5" /> <span className="max-sm:sr-only">{t.resetAll}</span>
            </button>
          ) : null}
        </div>
      </div>
      <p className="mt-1 text-sm text-muted">{t.text}</p>

      <div role="tablist" aria-label={t.tabsAria} className="no-scrollbar sticky top-16 z-20 -mx-1 mt-4 flex gap-1 overflow-x-auto bg-paper/95 px-1 py-2 backdrop-blur">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => {
              setTab(id);
              onPreview("chapter", id === "chapters" ? (chapter ?? chapters[0]?.key ?? null) : null);
            }}
            className={cn("h-9 shrink-0 rounded-xl px-3.5 text-sm font-medium transition", tab === id ? "bg-ink text-white" : "bg-white text-ink-soft ring-1 ring-line hover:ring-ink/30")}
          >
            {t.tabs[id]}
          </button>
        ))}
      </div>

      {kept ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-rose/60 px-4 py-3 text-sm text-ink-soft">
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

      <div role="tabpanel" className={cn("mt-4", !editable && "pointer-events-none opacity-60")}>
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
        {tab === "elements" ? <ElementsTab design={design} style={style} set={setStyle} onFocus={focus} /> : null}
        {tab === "colors" ? <ColorsTab design={design} base={base} style={style} set={setStyle} onFocus={focus} /> : null}
        {tab === "chapters" ? (
          <ChaptersTab
            chapters={chapters}
            selected={chapter}
            onSelect={(k) => {
              setChapter(k);
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
