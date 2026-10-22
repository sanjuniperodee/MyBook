"use client";

import { RotateCcw } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { ColorField, PanelSection, Segmented } from "@/components/design/controls";
import { chapterDesign, interiorStyleOptions, type ChapterOverride, type InteriorDesign, type InteriorStyle } from "@/lib/book/interiors";
import { cn } from "@/lib/class-names";
import { GlyphTile } from "./ElementsTab";
import { openerFills, palettes } from "./presets";
import { patchChapter } from "./style-edit";

export interface StudioChapter {
  key: string;
  title: string;
  number: number | null;
  epigraph?: string;
}

const INHERIT = "inherit" as const;

/**
 * Оформление отдельной главы: своё начало (номер, выключка, орнамент, буквица, акцент, заливка, рисунок) поверх
 * стиля книги. Остальные главы не меняются; «Как у всей книги» снимает настройку главы.
 */
export function ChaptersTab({
  chapters,
  selected,
  onSelect,
  design,
  style,
  set,
}: {
  chapters: StudioChapter[];
  selected: string | null;
  onSelect: (key: string) => void;
  design: InteriorDesign;
  style: InteriorStyle;
  set: (s: InteriorStyle) => void;
}) {
  const m = useMessages().design;
  const t = m.pages.chapters;
  const el = m.pages.elements;
  if (!chapters.length) return <p className="text-sm text-muted">{t.empty}</p>;
  const key = selected && chapters.some((c) => c.key === selected) ? selected : chapters[0].key;
  const own = style.chapters?.[key] ?? {};
  const cd = chapterDesign(design, key);
  const patch = (p: Partial<ChapterOverride>) => set(patchChapter(style, key, p));
  const inherit = m.pages.chapters.inherit;
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">{t.text}</p>
      <div role="listbox" aria-label={t.pick} className="flex flex-wrap gap-1.5">
        {chapters.map((c) => (
          <button
            key={c.key}
            type="button"
            role="option"
            aria-selected={c.key === key}
            onClick={() => onSelect(c.key)}
            className={cn("max-w-full truncate rounded-full px-3 py-1.5 text-sm transition", c.key === key ? "bg-ink text-white" : "bg-white text-ink-soft ring-1 ring-line hover:ring-ink/30")}
          >
            {c.number ? `${c.number}. ` : ""}
            {c.title}
            {style.chapters?.[c.key] ? <span className={cn("ml-1.5 inline-block size-1.5 rounded-full align-middle", c.key === key ? "bg-white" : "bg-wine")} title={t.styled} /> : null}
          </button>
        ))}
      </div>

      <PanelSection
        title={chapters.find((c) => c.key === key)?.title ?? ""}
        action={
          style.chapters?.[key] ? (
            <button type="button" onClick={() => set(patchChapter(style, key, null))} className="inline-flex items-center gap-1 text-xs text-muted hover:text-wine">
              <RotateCcw className="size-3.5" /> {t.reset}
            </button>
          ) : null
        }
      >
        <Segmented
          label={el.number}
          value={own.number ?? INHERIT}
          options={[{ value: INHERIT, label: inherit }, ...interiorStyleOptions.numbers.map((v) => ({ value: v, label: el.numbers[v] }))]}
          onChange={(v) => patch({ number: v === INHERIT ? undefined : v })}
          wrap
        />
        <Segmented
          label={m.pages.textTab.chapterAlign}
          value={own.align ?? INHERIT}
          options={[{ value: INHERIT, label: inherit }, ...(["center", "left"] as const).map((v) => ({ value: v, label: m.pages.textTab.chapterAligns[v] }))]}
          onChange={(v) => patch({ align: v === INHERIT ? undefined : v })}
        />
        <Segmented
          label={el.dropCap}
          value={own.dropCap === null ? "none" : (own.dropCap?.style ?? INHERIT)}
          options={[{ value: INHERIT, label: inherit }, ...(["none", "drop", "raised"] as const).map((v) => ({ value: v, label: el.dropCaps[v] }))]}
          onChange={(v) => patch({ dropCap: v === INHERIT ? undefined : v === "none" ? null : { style: v, lines: design.dropCap?.lines ?? (v === "drop" ? 3 : 2), ...(design.dropCap?.face ? { face: design.dropCap.face } : {}) } })}
          wrap
        />
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[13px] font-medium text-ink-soft">{el.ornament}</span>
            {own.ornament ? (
              <button type="button" onClick={() => patch({ ornament: undefined })} className="text-xs text-muted hover:text-wine">
                {inherit}
              </button>
            ) : null}
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {interiorStyleOptions.glyphs.map((g) => (
              <GlyphTile key={g} glyph={g} design={cd} active={cd.ornament === g} label={el.glyphs[g]} onClick={() => patch({ ornament: g })} />
            ))}
          </div>
        </div>
        <ColorField
          label={t.accent}
          value={own.accent ?? null}
          allowNone
          noneLabel={inherit}
          swatches={palettes.map((p) => p.colors.accent)}
          onChange={(v) => patch({ accent: v ?? undefined })}
        />
        <div>
          <ColorField label={t.fill} value={own.fill === undefined ? (design.opener.fill?.paper ?? null) : own.fill} allowNone noneLabel={el.frames.none} swatches={openerFills} onChange={(v) => patch({ fill: v })} />
          {own.fill !== undefined ? (
            <button type="button" onClick={() => patch({ fill: undefined })} className="mt-1 text-xs text-muted hover:text-wine">
              {inherit}
            </button>
          ) : null}
        </div>
        <Segmented
          label={el.art}
          value={own.art === undefined ? INHERIT : (own.art ?? "none")}
          options={[{ value: INHERIT, label: inherit }, ...(["none", ...interiorStyleOptions.arts] as const).map((v) => ({ value: v, label: el.arts[v] }))]}
          onChange={(v) => patch({ art: v === INHERIT ? undefined : v === "none" ? null : v })}
          wrap
        />
      </PanelSection>
    </div>
  );
}
