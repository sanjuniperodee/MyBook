"use client";

import { useMessages } from "@/i18n/client";
import { InlineDrawing } from "@/components/interior/graphics";
import { pxUnits } from "@/components/interior/units";
import { NumberField, PanelSection, Segmented, TextField, Toggle } from "@/components/design/controls";
import { dividerDrawing, vignetteDrawing } from "@/lib/book/interior-art";
import { interiorStyleOptions, type GlyphId, type InteriorDesign, type InteriorStyle } from "@/lib/book/interiors";
import { cssFont } from "@/lib/book/fonts";
import { TITLE_LINE_MAX } from "@/lib/book/title-line";
import { quoteStyle } from "@/lib/book/typesetting";
import { cn } from "@/lib/class-names";
import { patchSection } from "./style-edit";

const px = pxUnits(4);

/** Глиф виньетки — плитка с рисунком в цветах книги. */
export function GlyphTile({ glyph, design, active, onClick, label }: { glyph: GlyphId; design: InteriorDesign; active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn("flex h-12 items-center justify-center rounded-xl border bg-white transition hover:-translate-y-0.5", active ? "border-wine ring-1 ring-wine" : "border-line")}
    >
      <InlineDrawing drawing={vignetteDrawing(glyph, 10, { rule: design.palette.rule, ornament: design.palette.ornament })} u={px} />
    </button>
  );
}

/** Элементы: буквица и капитель, номер главы, орнамент и виньетка, разделители, рамки и рисунки, колонтитулы и колонцифры, цитаты, титул, фото. */
export function ElementsTab({ design, style, set, onFocus }: { design: InteriorDesign; style: InteriorStyle; set: (s: InteriorStyle) => void; onFocus: (kind: "chapter" | "front" | "photos" | "toc") => void }) {
  const m = useMessages().design;
  const t = m.pages.elements;
  const reset = m.ui.reset;
  const e = style.elements ?? {};
  const el = (patch: NonNullable<InteriorStyle["elements"]>, kind: "chapter" | "front" | "photos" | "toc" = "chapter") => {
    set(patchSection(style, "elements", patch));
    onFocus(kind);
  };
  const r = (key: keyof NonNullable<InteriorStyle["elements"]>, kind?: "chapter" | "front" | "photos" | "toc") => (e[key] !== undefined ? () => el({ [key]: undefined }, kind) : undefined);
  const O = interiorStyleOptions;
  const dropCap = design.dropCap?.style ?? "none";
  return (
    <div className="space-y-6">
      <PanelSection title={t.dropCap}>
        <Segmented value={dropCap} options={(["none", "drop", "raised"] as const).map((v) => ({ value: v, label: t.dropCaps[v] }))} onChange={(v) => el({ dropCap: v })} onReset={r("dropCap")} resetLabel={reset} />
        {design.dropCap?.style === "drop" ? <NumberField label={t.dropLines} value={design.dropCap.lines} min={2} max={4} step={1} slider={false} onChange={(v) => el({ dropLines: v })} onReset={r("dropLines")} resetLabel={reset} /> : null}
        <div className="flex items-center gap-4 rounded-xl bg-white p-3 ring-1 ring-line">
          <span className="text-[44px] leading-none" style={{ fontFamily: cssFont(design.dropCap?.face?.font ?? design.display.font), color: design.palette.accent }}>
            {dropCap === "none" ? "" : m.ui.fonts.sample.charAt(0)}
          </span>
          <Toggle label={t.leadIn} checked={design.leadIn} onChange={(v) => el({ leadIn: v })} />
        </div>
      </PanelSection>

      <PanelSection title={t.number}>
        <Segmented value={design.opener.number} options={O.numbers.map((v) => ({ value: v, label: t.numbers[v] }))} onChange={(v) => el({ number: v })} onReset={r("number")} resetLabel={reset} wrap />
      </PanelSection>

      <PanelSection title={t.ornament}>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {O.glyphs.map((g) => (
            <GlyphTile key={g} glyph={g} design={design} active={design.ornament === g} label={t.glyphs[g]} onClick={() => el({ ornament: g })} />
          ))}
        </div>
        <Toggle label={t.vignette} checked={design.opener.vignette !== false} onChange={(v) => el({ vignette: v })} />
      </PanelSection>

      <PanelSection title={t.divider}>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {O.dividers.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={design.divider === k}
              onClick={() => el({ divider: k })}
              className={cn("flex h-14 flex-col items-center justify-center gap-1 rounded-xl border bg-white text-[11px] text-muted transition hover:-translate-y-0.5", design.divider === k ? "border-wine ring-1 ring-wine" : "border-line")}
            >
              <span className="flex h-6 items-center" style={{ color: design.palette.rule }}>
                {k === "stars" ? "* * *" : k === "space" ? "" : <InlineDrawing drawing={dividerDrawing(design.ornament, k, design.palette)} u={px} />}
              </span>
              {t.dividers[k]}
            </button>
          ))}
        </div>
      </PanelSection>

      <PanelSection title={t.frame}>
        <Segmented value={design.frame} options={O.frames.map((v) => ({ value: v, label: t.frames[v] }))} onChange={(v) => el({ frame: v }, "front")} onReset={r("frame", "front")} resetLabel={reset} wrap />
      </PanelSection>

      <PanelSection title={t.art}>
        <Segmented
          value={design.opener.art ?? "none"}
          options={(["none", ...O.arts] as const).map((v) => ({ value: v, label: t.arts[v] }))}
          onChange={(v) => el({ art: v === "none" ? null : v })}
          onReset={r("art")}
          resetLabel={reset}
          wrap
        />
      </PanelSection>

      <PanelSection title={t.runningHead}>
        <Segmented value={design.runningHead} options={(["none", "plain", "ruled"] as const).map((v) => ({ value: v, label: t.runningHeads[v] }))} onChange={(v) => el({ runningHead: v })} onReset={r("runningHead")} resetLabel={reset} />
        <Segmented label={t.folio} value={design.folio.align} options={(["center", "outer", "none"] as const).map((v) => ({ value: v, label: t.folios[v] }))} onChange={(v) => el({ folio: v })} onReset={r("folio")} resetLabel={reset} />
        {design.folio.align !== "none" ? <Toggle label={t.folioDashes} checked={!!design.folio.dashes} onChange={(v) => el({ folioDashes: v })} /> : null}
      </PanelSection>

      <PanelSection title={t.quote}>
        <Segmented value={quoteStyle(design)} options={O.quotes.map((v) => ({ value: v, label: t.quotes[v] }))} onChange={(v) => el({ quote: v })} onReset={r("quote")} resetLabel={reset} />
      </PanelSection>

      <PanelSection title={t.titlePage}>
        <Segmented value={design.titlePage?.layout ?? "center"} options={O.titles.map((v) => ({ value: v, label: t.titlePages[v] }))} onChange={(v) => el({ titlePage: v }, "front")} onReset={r("titlePage", "front")} resetLabel={reset} />
        <Toggle label={t.titleAuthor} checked={design.titlePage?.author !== false} onChange={(v) => el({ titleAuthor: v }, "front")} />
        <TextField label={t.titleLine} value={e.titleLine ?? ""} placeholder={t.titleLinePlaceholder} max={TITLE_LINE_MAX} onChange={(v) => el({ titleLine: v }, "front")} onReset={r("titleLine", "front")} resetLabel={reset} />
        <p className="text-xs text-muted">{t.titleLineHint}</p>
      </PanelSection>

      <PanelSection title={t.photoFrame}>
        <Segmented value={design.photos.frame} options={O.photoFrames.map((v) => ({ value: v, label: t.photoFrames[v] }))} onChange={(v) => el({ photoFrame: v }, "photos")} onReset={r("photoFrame", "photos")} resetLabel={reset} wrap />
        <Segmented label={t.caption} value={design.photos.caption} options={O.captions.map((v) => ({ value: v, label: t.captions[v] }))} onChange={(v) => el({ caption: v }, "photos")} onReset={r("caption", "photos")} resetLabel={reset} />
      </PanelSection>
    </div>
  );
}
