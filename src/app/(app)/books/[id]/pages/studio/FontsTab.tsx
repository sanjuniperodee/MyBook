"use client";

import { Check } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { FaceControls, FontPicker } from "@/components/design/FontPicker";
import { PanelSection } from "@/components/design/controls";
import { cssFont, type FontKey } from "@/lib/book/fonts";
import type { FontPick, FontRole, InteriorDesign, InteriorStyle, TextFace } from "@/lib/book/interiors";
import { headingFace, quoteFace } from "@/lib/book/typesetting";
import { cn } from "@/lib/class-names";
import { fontPairs } from "./presets";
import { patchSection } from "./style-edit";

/** Начертание роли в дизайне (со всеми настройками). */
function roleFace(design: InteriorDesign, role: FontRole): TextFace {
  switch (role) {
    case "display":
      return design.display;
    case "heading":
      return headingFace(design);
    case "body":
      return { font: design.type.body, weight: design.text?.weight ?? 400 };
    case "quote":
      return quoteFace(design);
    case "label":
      return design.label;
    case "numeral":
      return design.opener.numeral ?? design.display;
    case "initial":
      return design.dropCap?.face ?? design.display;
    case "caption":
      return design.photos.captionFace ?? (design.photos.caption === "hand" ? { font: "caveat", weight: 500 } : design.photos.caption === "label" ? design.label : { font: design.type.body, weight: 400, italic: true });
  }
}

export function FontsTab({ design, style, set, sample, onFocus }: { design: InteriorDesign; style: InteriorStyle; set: (s: InteriorStyle) => void; sample: string; onFocus: (kind: "chapter" | "front" | "photos") => void }) {
  const t = useMessages().design.pages.fonts;
  const own = style.fonts ?? {};
  const pick = (role: FontRole, patch: Partial<FontPick>) => {
    const face = roleFace(design, role);
    const next: FontPick = { font: face.font, weight: face.weight, ...(face.italic ? { italic: true } : {}), ...own[role], ...patch };
    set(patchSection(style, "fonts", { [role]: next }));
  };
  const reset = (role: FontRole) => (own[role] ? () => set(patchSection(style, "fonts", { [role]: undefined })) : undefined);
  const roles: FontRole[] = ["display", ...(design.opener.number !== "label" && design.opener.number !== "none" ? (["numeral"] as const) : []), "heading", "body", "quote", "label", ...(design.dropCap ? (["initial"] as const) : []), "caption"];
  const activePair = fontPairs.find((p) => (Object.keys(p.fonts) as FontRole[]).every((r) => own[r]?.font === p.fonts[r]?.font));
  return (
    <div className="space-y-6">
      <PanelSection title={t.pairs}>
        <p className="-mt-2 text-xs text-muted">{t.pairsText}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {fontPairs.map((p) => {
            const display = p.fonts.display!.font as FontKey;
            const body = p.fonts.body!.font as FontKey;
            const active = activePair?.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  let next = patchSection(style, "fonts", p.fonts);
                  if (p.display) next = patchSection(next, "display", p.display);
                  set(next);
                  onFocus("chapter");
                }}
                className={cn("relative rounded-2xl border bg-white p-3 text-left transition hover:-translate-y-0.5 hover:shadow-soft", active ? "border-wine ring-1 ring-wine" : "border-line")}
              >
                {active ? <Check className="absolute top-2 right-2 size-4 text-wine" /> : null}
                <div className="truncate text-[22px] leading-tight text-ink" style={{ fontFamily: cssFont(display), fontWeight: p.fonts.display!.weight ?? 400, textTransform: p.display?.upper ? "uppercase" : undefined, letterSpacing: p.display?.tracking ? `${p.display.tracking}em` : undefined, fontStyle: p.fonts.display!.italic ? "italic" : undefined }}>
                  {t.pairNames[p.id as keyof typeof t.pairNames] ?? p.id}
                </div>
                <div className="mt-1 line-clamp-2 text-[12px] leading-snug text-muted" style={{ fontFamily: cssFont(body) }}>
                  {sample}
                </div>
              </button>
            );
          })}
        </div>
      </PanelSection>
      {roles.map((role) => {
        const face = roleFace(design, role);
        return (
          <PanelSection key={role} title={t.roles[role]}>
            {t.rolesHint[role as keyof typeof t.rolesHint] ? <p className="-mt-2 text-xs text-muted">{t.rolesHint[role as keyof typeof t.rolesHint]}</p> : null}
            <FontPicker
              label={t.roles[role]}
              value={face.font}
              bodyOnly={role === "body"}
              sample={role === "body" || role === "quote" ? undefined : sample}
              onChange={(font) => {
                pick(role, { font });
                onFocus(role === "caption" ? "photos" : "chapter");
              }}
              onReset={reset(role)}
            />
            <FaceControls font={face.font} weight={face.weight} italic={face.italic} allowItalic={role !== "body"} onChange={(v) => pick(role, role === "body" ? { weight: v.weight } : v)} />
          </PanelSection>
        );
      })}
    </div>
  );
}
