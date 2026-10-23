"use client";

import { AlertTriangle, Check } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { ColorField, PanelSection } from "@/components/design/controls";
import { luminance, PAPER, type InteriorDesign, type InteriorPalette, type InteriorStyle } from "@/lib/book/interiors";
import { cn } from "@/lib/class-names";
import { openerFills, palettes, papers } from "./presets";
import { patchSection } from "./style-edit";

/** Контраст двух цветов по WCAG: текст на бумаге должен читаться (≥ 4.5 для основного текста). */
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const KEYS: (keyof InteriorPalette)[] = ["ink", "accent", "muted", "ornament", "rule"];

/** Цвета: готовые палитры, каждый цвет отдельно, тон бумаги и заливка начальных полос глав. */
export function ColorsTab({ design, base, style, set, onFocus }: { design: InteriorDesign; base: InteriorDesign; style: InteriorStyle; set: (s: InteriorStyle) => void; onFocus: (kind: "chapter" | "front") => void }) {
  const m = useMessages().design;
  const t = m.pages.colors;
  const reset = m.ui.reset;
  const c = style.colors ?? {};
  const colors = (patch: NonNullable<InteriorStyle["colors"]>) => {
    set(patchSection(style, "colors", patch));
    onFocus("chapter");
  };
  const paper = design.paper ?? PAPER;
  const swatches = [...new Set([...Object.values(base.palette), ...palettes.flatMap((p) => [p.colors.accent, p.colors.ink])])];
  const active = palettes.find((p) => KEYS.every((k) => design.palette[k].toUpperCase() === p.colors[k]));
  const fill = design.opener.fill?.paper ?? null;
  const lowContrast = contrast(design.palette.ink, paper) < 4.5;
  return (
    <div className="space-y-6">
      <PanelSection title={t.palettes}>
        <p className="-mt-2 text-xs text-muted">{t.palettesText}</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {palettes.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={active?.id === p.id}
              onClick={() => colors({ ...p.colors })}
              className={cn("relative flex flex-col gap-2 rounded-2xl border bg-white p-2.5 text-left transition hover:-translate-y-0.5", active?.id === p.id ? "border-wine ring-1 ring-wine" : "border-line")}
            >
              <span className="flex -space-x-1.5">
                {[p.colors.ink, p.colors.accent, p.colors.ornament, p.colors.muted].map((col, i) => (
                  <span key={i} className="size-6 rounded-full border-2 border-white" style={{ background: col }} />
                ))}
              </span>
              <span className="text-xs text-ink-soft">{t.names[p.id]}</span>
              {active?.id === p.id ? <Check className="absolute top-2 right-2 size-3.5 text-wine" /> : null}
            </button>
          ))}
        </div>
      </PanelSection>

      <PanelSection title={m.pages.tabs.colors}>
        {KEYS.map((k) => (
          <ColorField key={k} label={t[k]} value={design.palette[k]} swatches={swatches} onChange={(v) => v && colors({ [k]: v })} onReset={c[k] ? () => colors({ [k]: undefined }) : undefined} resetLabel={reset} />
        ))}
        {lowContrast ? (
          <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="size-4 shrink-0" /> {t.contrast}
          </p>
        ) : null}
      </PanelSection>

      <PanelSection title={t.paper}>
        <p className="-mt-2 text-xs text-muted">{t.paperHint}</p>
        <ColorField label={t.paper} value={paper} swatches={papers} onChange={(v) => v && colors({ paper: v === PAPER ? undefined : v })} onReset={c.paper ? () => colors({ paper: undefined }) : undefined} resetLabel={reset} />
      </PanelSection>

      <PanelSection title={t.opener}>
        <ColorField
          label={t.opener}
          value={fill}
          allowNone
          noneLabel={t.openerNone}
          swatches={openerFills}
          onChange={(v) => colors({ opener: v })}
          onReset={c.opener !== undefined ? () => colors({ opener: undefined }) : undefined}
          resetLabel={reset}
        />
      </PanelSection>
    </div>
  );
}
