"use client";

import { useRef, useState } from "react";
import { SaveIndicator } from "@/components/SaveIndicator";
import { OccasionPicker } from "@/components/OccasionPicker";
import { Choice, FormSection as Section } from "@/components/ui/Choice";
import { useAutosave } from "@/hooks/useAutosave";
import { apiFetch } from "@/lib/client-api";
import { formats, type FormatId } from "@/lib/book/formats";
import { cn } from "@/lib/class-names";
import { useMessages } from "@/i18n/client";
import { localeMeta, locales, type Locale } from "@/i18n/config";
import { useRouter } from "next/navigation";
import { confirmDialog, toast, toastError } from "@/components/ui/overlays";
import { bookKind, RECORDED_BY_MAX } from "@/lib/content/kinds";
import type { Gender } from "@/modules/authoring/domain";

interface SettingsState {
  format: FormatId;
  /** Автобиография: имя рассказчика (на других видах имя автора правят на обложке). */
  authorName: string;
  authorGender: Gender;
  /** Автобиография: кто записал со слов рассказчика. */
  recordedBy: string;
  /** Своя книга: необязательный получатель. */
  recipientName: string;
  recipientGender: Gender;
  occasion: string | null;
  occasionDate: string | null;
  language: Locale;
}

export function SettingsForm({ bookId, theme, initial, fixedRecipientGender, editable }: { bookId: string; theme: string; initial: SettingsState; fixedRecipientGender: boolean; editable: boolean }) {
  const [s, setS] = useState(initial);
  const m = useMessages();
  const t = m.books.settings;
  const kind = bookKind(theme);
  const router = useRouter();
  const [switching, setSwitching] = useState(false);

  // Язык меняем сразу и отдельным запросом: сервер переводит вопросы книги, это не «черновое» поле.
  const changeLanguage = async (language: Locale) => {
    if (!editable || language === s.language || switching) return;
    const label = localeMeta[language].label;
    if (!(await confirmDialog({ title: t.languageConfirm(label), text: kind === "blank" ? t.languageConfirmTextBlank : kind === "autobiography" ? t.languageConfirmTextAutobiography : t.languageConfirmText }))) return;
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
        <OccasionPicker theme={theme} defaultOccasion={s.occasion} defaultDate={s.occasionDate} disabled={!editable} onChange={(occasion, occasionDate) => update({ occasion, occasionDate })} />
      </Section>

      <Section id="language" title={t.language} description={kind === "blank" ? t.languageTextBlank : t.languageText}>
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

      {kind === "autobiography" ? (
        <Section id="narrator" title={t.narrator} description={t.narratorText}>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="narratorName">{t.narratorName}</label>
              <input className="input" id="narratorName" value={s.authorName} maxLength={60} onChange={(e) => update({ authorName: e.target.value })} disabled={!editable} />
            </div>
            <div>
              <span className="label">{t.narratorAs}</span>
              <Toggle value={s.authorGender} onChange={(g) => update({ authorGender: g })} labels={m.books.wizard.genders.author} disabled={!editable} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="recordedBy">{t.recordedBy}</label>
              <input className="input" id="recordedBy" value={s.recordedBy} maxLength={RECORDED_BY_MAX} placeholder={t.recordedByPlaceholder} onChange={(e) => update({ recordedBy: e.target.value })} disabled={!editable} />
              <p className="mt-2 text-sm text-muted">{t.recordedByHint}</p>
            </div>
          </div>
        </Section>
      ) : null}

      {kind === "blank" ? (
        <Section id="recipient" title={t.optionalRecipient} description={t.optionalRecipientText}>
          <input className="input max-w-md" aria-label={t.optionalRecipient} value={s.recipientName} maxLength={60} placeholder={t.optionalRecipientPlaceholder} onChange={(e) => update({ recipientName: e.target.value })} disabled={!editable} />
        </Section>
      ) : null}

      {kind === "gift" ? (
        // Подарок: формулировки склоняются по роду автора и получателя. У автобиографии род рассказчика — выше, у своей книги склоняемых текстов нет.
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
      ) : null}
    </div>
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
