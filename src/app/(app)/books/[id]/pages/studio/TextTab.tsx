"use client";

import { AlignCenter, AlignJustify, AlignLeft, AlignRight } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { NumberField, PanelSection, Segmented, Toggle } from "@/components/design/controls";
import { LIMITS, type InteriorDesign, type InteriorStyle, type TextAlign } from "@/lib/book/interiors";
import { headingFace, indentEm, paraAfter } from "@/lib/book/typesetting";
import { patchSection } from "./style-edit";

/**
 * Текст: основной набор (кегль, интерлиньяж, разрядка, выключка, красная строка, отбивки, ширина колонки), заголовки
 * разделов, названия глав и титул, служебные надписи. Значения — из стиля с настройками; «↺» — вернуть как в стиле.
 */
export function TextTab({ design, style, set, onFocus }: { design: InteriorDesign; style: InteriorStyle; set: (s: InteriorStyle) => void; onFocus: (kind: "chapter" | "front") => void }) {
  const m = useMessages().design;
  const t = m.pages.textTab;
  const reset = m.ui.reset;
  const b = style.body ?? {};
  const h = style.heading ?? {};
  const d = style.display ?? {};
  const l = style.label ?? {};
  const body = (patch: NonNullable<InteriorStyle["body"]>) => {
    set(patchSection(style, "body", patch));
    onFocus("chapter");
  };
  const heading = (patch: NonNullable<InteriorStyle["heading"]>) => {
    set(patchSection(style, "heading", patch));
    onFocus("chapter");
  };
  const display = (patch: NonNullable<InteriorStyle["display"]>, kind: "chapter" | "front" = "chapter") => {
    set(patchSection(style, "display", patch));
    onFocus(kind);
  };
  const label = (patch: NonNullable<InteriorStyle["label"]>) => set(patchSection(style, "label", patch));
  const r = <T,>(v: T | undefined, apply: () => void) => (v !== undefined ? apply : undefined);
  const hf = headingFace(design);
  const icons: Record<TextAlign, React.ReactNode> = { justify: <AlignJustify className="size-4" />, left: <AlignLeft className="size-4" />, center: <AlignCenter className="size-4" />, right: <AlignRight className="size-4" /> };
  return (
    <div className="space-y-6">
      <PanelSection title={t.body}>
        <NumberField label={t.size} unit={t.units.pt} value={design.type.bodySize} min={8} max={14} step={0.1} onChange={(v) => body({ size: v })} onReset={r(b.size, () => body({ size: undefined }))} resetLabel={reset} />
        <NumberField label={t.lineHeight} unit={t.units.x} value={design.type.lineHeight} min={LIMITS.lineHeight[0]} max={2} step={0.05} onChange={(v) => body({ lineHeight: v })} onReset={r(b.lineHeight, () => body({ lineHeight: undefined }))} resetLabel={reset} />
        <NumberField label={t.tracking} unit={t.units.pct} scale={100} value={design.text?.tracking ?? 0} min={LIMITS.bodyTracking[0]} max={0.08} step={0.005} onChange={(v) => body({ tracking: v || undefined })} onReset={r(b.tracking, () => body({ tracking: undefined }))} resetLabel={reset} />
        <Segmented
          label={t.align}
          value={design.text?.align ?? "justify"}
          options={(["justify", "left", "center", "right"] as const).map((a) => ({ value: a, label: icons[a], title: t.aligns[a] }))}
          onChange={(v) => body({ align: v })}
          onReset={r(b.align, () => body({ align: undefined }))}
          resetLabel={reset}
        />
        <NumberField label={t.indent} unit={t.units.em} value={indentEm(design)} min={0} max={3} step={0.1} onChange={(v) => body({ indent: v })} onReset={r(b.indent, () => body({ indent: undefined }))} resetLabel={reset} />
        <NumberField label={t.paraGap} unit={t.units.em} value={paraAfter(design)} min={0} max={1.5} step={0.05} onChange={(v) => body({ paraGap: v })} onReset={r(b.paraGap, () => body({ paraGap: undefined }))} resetLabel={reset} />
        <NumberField label={t.measure} unit={t.units.pct} scale={100} value={design.text?.measure ?? 1} min={LIMITS.measure[0]} max={1} step={0.01} onChange={(v) => body({ measure: v >= 1 ? undefined : v })} onReset={r(b.measure, () => body({ measure: undefined }))} resetLabel={reset} />
        <p className="text-xs text-muted">{t.hint}</p>
      </PanelSection>

      <PanelSection title={t.headings}>
        <NumberField label={t.headingSize} unit={t.units.x} value={design.heading.size} min={1} max={2.6} step={0.05} onChange={(v) => heading({ size: v })} onReset={r(h.size, () => heading({ size: undefined }))} resetLabel={reset} />
        <Segmented label={t.headingAlign} value={design.heading.align} options={(["left", "center"] as const).map((a) => ({ value: a, label: t.headingAligns[a] }))} onChange={(v) => heading({ align: v })} onReset={r(h.align, () => heading({ align: undefined }))} resetLabel={reset} />
        <NumberField label={t.tracking} unit={t.units.pct} scale={100} value={hf.tracking ?? 0} min={0} max={0.3} step={0.01} onChange={(v) => heading({ tracking: v })} onReset={r(h.tracking, () => heading({ tracking: undefined }))} resetLabel={reset} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Toggle label={t.upper} checked={!!hf.upper} onChange={(v) => heading({ upper: v })} />
          <Toggle label={t.accent} checked={!!design.heading.accent} onChange={(v) => heading({ accent: v })} />
          <Toggle label={t.bar} checked={!!design.heading.bar} onChange={(v) => heading({ bar: v })} />
        </div>
      </PanelSection>

      <PanelSection title={t.chapters}>
        <NumberField label={t.chapterSize} unit={t.units.pt} value={design.opener.titleSize} min={LIMITS.displaySize[0]} max={48} step={0.5} onChange={(v) => display({ size: v })} onReset={r(d.size, () => display({ size: undefined }))} resetLabel={reset} />
        <Segmented label={t.chapterAlign} value={design.opener.align} options={(["center", "left"] as const).map((a) => ({ value: a, label: t.chapterAligns[a] }))} onChange={(v) => display({ align: v })} onReset={r(d.align, () => display({ align: undefined }))} resetLabel={reset} />
        <NumberField label={t.chapterTop} unit={t.units.pct} scale={100} value={design.opener.top} min={LIMITS.displayTop[0]} max={LIMITS.displayTop[1]} step={0.01} onChange={(v) => display({ top: v })} onReset={r(d.top, () => display({ top: undefined }))} resetLabel={reset} />
        <NumberField label={t.tracking} unit={t.units.pct} scale={100} value={design.display.tracking ?? 0} min={0} max={0.4} step={0.01} onChange={(v) => display({ tracking: v })} onReset={r(d.tracking, () => display({ tracking: undefined }))} resetLabel={reset} />
        <Toggle label={t.upper} checked={!!design.display.upper} onChange={(v) => display({ upper: v })} />
        <NumberField label={t.titleSize} unit={t.units.pt} value={design.titlePage?.size ?? 30} min={LIMITS.titleSize[0]} max={60} step={0.5} onChange={(v) => display({ titleSize: v }, "front")} onReset={r(d.titleSize, () => display({ titleSize: undefined }, "front"))} resetLabel={reset} />
      </PanelSection>

      <PanelSection title={t.labels}>
        <NumberField label={t.labelSize} unit={t.units.pt} value={design.label.size} min={LIMITS.labelSize[0]} max={10} step={0.1} onChange={(v) => label({ size: v })} onReset={r(l.size, () => label({ size: undefined }))} resetLabel={reset} />
        <NumberField label={t.tracking} unit={t.units.pct} scale={100} value={design.label.tracking ?? 0} min={0} max={LIMITS.labelTracking[1]} step={0.01} onChange={(v) => label({ tracking: v })} onReset={r(l.tracking, () => label({ tracking: undefined }))} resetLabel={reset} />
        <Toggle label={t.upper} checked={!!design.label.upper} onChange={(v) => label({ upper: v })} />
      </PanelSection>
    </div>
  );
}
