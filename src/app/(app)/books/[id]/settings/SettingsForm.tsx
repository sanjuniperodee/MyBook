"use client";

import { useRef, useState } from "react";
import { Check } from "lucide-react";
import { SaveIndicator } from "@/components/SaveIndicator";
import { OccasionPicker } from "@/components/OccasionPicker";
import { useAutosave } from "@/hooks/useAutosave";
import { apiFetch } from "@/lib/client-api";
import { typographies, cssFont, type TypographyId } from "@/lib/book/fonts";
import { formats, type FormatId } from "@/lib/book/formats";
import { cn } from "@/lib/utils";
import { useMessages } from "@/i18n/client";
import { localeMeta, locales, type Locale } from "@/i18n/config";
import { useRouter } from "next/navigation";
import { confirmDialog, toast, toastError } from "@/components/ui/overlays";
import type { Gender } from "@/lib/db/schema";

export interface SettingsState {
  typography: TypographyId;
  format: FormatId;
  dedication: string;
  photoPlacement: "chapters" | "end";
  showToc: boolean;
  authorGender: Gender;
  recipientGender: Gender;
  occasion: string | null;
  occasionDate: string | null;
  language: Locale;
}

export function SettingsForm({ bookId, initial, fixedRecipientGender, editable }: { bookId: string; initial: SettingsState; fixedRecipientGender: boolean; editable: boolean }) {
  const [s, setS] = useState(initial);
  const m = useMessages();
  const t = m.books.settings;
  const router = useRouter();
  const [switching, setSwitching] = useState(false);

  // Язык меняем сразу и отдельным запросом: сервер переводит вопросы книги, это не «черновое» поле.
  const changeLanguage = async (language: Locale) => {
    if (!editable || language === s.language || switching) return;
    const label = localeMeta[language].label;
    if (!(await confirmDialog({ title: t.languageConfirm(label), text: t.languageConfirmText }))) return;
    setSwitching(true);
    try {
      await apiFetch(`/api/books/${bookId}`, { method: "PATCH", json: { language } });
      setS((v) => ({ ...v, language }));
      toast(t.languageChanged);
      router.refresh();
    } catch (e) {
      toastError(e);
    } finally {
      setSwitching(false);
    }
  };
  const changes = useRef<Partial<SettingsState>>({});
  const { status, error, schedule } = useAutosave<null>(async () => {
    const patch = changes.current;
    changes.current = {};
    if (!Object.keys(patch).length) return;
    try {
      await apiFetch(`/api/books/${bookId}`, { method: "PATCH", json: patch });
    } catch (e) {
      changes.current = { ...patch, ...changes.current };
      throw e;
    }
  }, 600);
  const update = (patch: Partial<SettingsState>) => {
    if (!editable) return;
    setS((v) => ({ ...v, ...patch }));
    changes.current = { ...changes.current, ...patch };
    schedule(null);
  };

  return (
    <div className="space-y-12">
      <div className="flex justify-end">
        <SaveIndicator status={status} error={error} />
      </div>

      <Section id="occasion" title={t.occasion} description={t.occasionText}>
        <OccasionPicker defaultOccasion={s.occasion} defaultDate={s.occasionDate} disabled={!editable} onChange={(occasion, occasionDate) => update({ occasion, occasionDate })} />
      </Section>

      <Section id="language" title={t.language} description={t.languageText}>
        <div className="grid max-w-md grid-cols-2 gap-3">
          {locales.map((l) => (
            <Choice key={l} active={s.language === l} onClick={() => changeLanguage(l)} disabled={!editable || switching}>
              <div className="font-medium" lang={l}>
                {localeMeta[l].label}
              </div>
            </Choice>
          ))}
        </div>
      </Section>

      <Section title={t.typography} description={t.typographyText}>
        <div className="grid gap-4 sm:grid-cols-3">
          {Object.values(typographies).map((ty) => (
            <Choice key={ty.id} active={s.typography === ty.id} onClick={() => update({ typography: ty.id })} disabled={!editable}>
              <div style={{ fontFamily: cssFont(ty.heading), fontStyle: ty.headingItalic ? "italic" : "normal", fontWeight: ty.headingWeight }} className="text-2xl">
                {m.books.settings.sampleHeading}
              </div>
              <p style={{ fontFamily: cssFont(ty.body) }} className="mt-2 text-[13px] leading-relaxed text-ink-soft">
                {m.books.settings.sampleText}
              </p>
              <div className="mt-4 text-sm font-medium">{m.catalog.typography[ty.id].name}</div>
              <div className="text-xs text-muted">{m.catalog.typography[ty.id].description}</div>
            </Choice>
          ))}
        </div>
      </Section>

      <Section title={t.format}>
        <div className="grid gap-4 sm:grid-cols-2">
          {Object.values(formats).map((f) => (
            <Choice key={f.id} active={s.format === f.id} onClick={() => update({ format: f.id })} disabled={!editable}>
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-end justify-center">
                  <div className="rounded-[2px] border border-ink/20 bg-cream" style={{ width: (f.widthMm / 210) * 60, height: (f.heightMm / 210) * 60 }} />
                </div>
                <div>
                  <div className="font-medium">{m.catalog.formats[f.id]}</div>
                  <div className="text-sm text-muted">{t.formatHints[f.id]}</div>
                </div>
              </div>
            </Choice>
          ))}
        </div>
      </Section>

      <Section title={t.dedication} description={t.dedicationText}>
        <textarea
          className="input"
          rows={3}
          maxLength={600}
          value={s.dedication}
          onChange={(e) => update({ dedication: e.target.value })}
          placeholder={t.dedicationPlaceholder}
          disabled={!editable}
        />
      </Section>

      <Section title={t.photos}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Choice active={s.photoPlacement === "chapters"} onClick={() => update({ photoPlacement: "chapters" })} disabled={!editable}>
            <div className="font-medium">{t.photosChapters}</div>
            <div className="text-sm text-muted">{t.photosChaptersText}</div>
          </Choice>
          <Choice active={s.photoPlacement === "end"} onClick={() => update({ photoPlacement: "end" })} disabled={!editable}>
            <div className="font-medium">{t.photosEnd}</div>
            <div className="text-sm text-muted">{t.photosEndText}</div>
          </Choice>
        </div>
      </Section>

      <Section title={t.toc}>
        <label className="flex items-center gap-3">
          <input type="checkbox" className="size-5 accent-wine" checked={s.showToc} onChange={(e) => update({ showToc: e.target.checked })} disabled={!editable} />
          <span>{t.tocLabel}</span>
        </label>
      </Section>

      <Section title={t.wording} description={t.wordingText}>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <span className="label">{t.author}</span>
            <Toggle value={s.authorGender} onChange={(g) => update({ authorGender: g })} labels={m.books.wizard.genders.author} disabled={!editable} />
          </div>
          {!fixedRecipientGender ? (
            <div>
              <span className="label">{t.recipientFor}</span>
              <Toggle value={s.recipientGender} onChange={(g) => update({ recipientGender: g })} labels={m.books.wizard.genders.recipient} disabled={!editable} />
            </div>
          ) : null}
        </div>
      </Section>
    </div>
  );
}

function Section({ id, title, description, children }: { id?: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28">
      <h2 className="text-xl font-semibold">{title}</h2>
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Choice({ active, onClick, children, disabled }: { active: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn("relative rounded-2xl border bg-white p-5 text-left transition", active ? "border-wine ring-4 ring-wine/10" : "border-line hover:border-ink/30")}
    >
      {active ? (
        <span className="absolute top-3 right-3 flex size-6 items-center justify-center rounded-full bg-wine text-white">
          <Check className="size-3.5" />
        </span>
      ) : null}
      {children}
    </button>
  );
}

function Toggle({ value, onChange, labels, disabled }: { value: Gender; onChange: (g: Gender) => void; labels: [string, string]; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-2xl bg-cream/70 p-1">
      {(["m", "f"] as const).map((g, i) => (
        <button key={g} type="button" disabled={disabled} onClick={() => onChange(g)} className={cn("h-10 rounded-xl text-sm font-medium transition", value === g ? "bg-white shadow-soft" : "text-muted hover:text-ink")}>
          {labels[i]}
        </button>
      ))}
    </div>
  );
}
