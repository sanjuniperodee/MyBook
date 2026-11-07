"use client";

import { useRef, useState } from "react";
import { SaveIndicator } from "@/components/SaveIndicator";
import { OccasionPicker } from "@/components/OccasionPicker";
import { Panel } from "@/components/ui/Panel";
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

export function SettingsForm({ bookId, theme, initial, fixedRecipientGender, editable, footer }: { bookId: string; theme: string; initial: SettingsState; fixedRecipientGender: boolean; editable: boolean; /** После панелей: ссылка на оформление страниц. */ footer?: React.ReactNode }) {
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

  const st = m.bookStudio.settings;
  const anchors: { id: string; label: string }[] = [
    { id: "occasion", label: t.occasion },
    { id: "language", label: t.language },
    { id: "format", label: t.format },
    ...(kind === "autobiography" ? [{ id: "narrator", label: t.narrator }] : []),
    ...(kind === "blank" ? [{ id: "recipient", label: t.optionalRecipient }] : []),
    ...(kind === "gift" ? [{ id: "wording", label: t.wording }] : []),
  ];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[200px_minmax(0,640px)] lg:gap-12">
      {/* Якоря разделов: на компьютере слева и липкие, на телефоне — лента */}
      <div className="lg:sticky lg:top-36 lg:self-start">
        <nav aria-label={st.anchors} className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:block lg:space-y-0.5 lg:overflow-visible lg:px-0">
          {anchors.map((a) => (
            <a key={a.id} href={`#${a.id}`} className="chip shrink-0 lg:flex lg:h-9 lg:w-full lg:rounded-[10px] lg:border-0 lg:bg-transparent lg:px-3 lg:hover:bg-sunken">
              {a.label}
            </a>
          ))}
        </nav>
        <div className="mt-4 hidden px-3 lg:block">
          <SaveIndicator status={status} error={error} />
          <p className="mt-1 text-xs text-muted">{st.saveHint}</p>
        </div>
      </div>

      <div className="min-w-0 space-y-5">
        <Panel id="occasion" title={t.occasion} description={t.occasionText} actions={<SaveIndicator status={status} error={error} className="text-xs lg:hidden" />}>
          <OccasionPicker theme={theme} defaultOccasion={s.occasion} defaultDate={s.occasionDate} disabled={!editable} onChange={(occasion, occasionDate) => update({ occasion, occasionDate })} />
        </Panel>

        <Panel id="language" title={t.language} description={kind === "blank" ? t.languageTextBlank : t.languageText}>
          <div role="radiogroup" aria-label={t.language} className="grid max-w-md grid-cols-2 gap-2.5">
            {locales.map((l) => (
              <ChoiceRow key={l} on={s.language === l} onClick={() => changeLanguage(l)} disabled={!editable || switching}>
                <span className="font-medium" lang={l}>
                  {localeMeta[l].label}
                </span>
              </ChoiceRow>
            ))}
          </div>
        </Panel>

        <Panel id="format" title={t.format}>
          <div role="radiogroup" aria-label={t.format} className="grid gap-2.5 sm:grid-cols-2">
            {Object.values(formats).map((f) => (
              <ChoiceRow key={f.id} on={s.format === f.id} onClick={() => update({ format: f.id })} disabled={!editable}>
                <span className="flex items-center gap-3">
                  <span className="flex h-12 w-10 shrink-0 items-end justify-center">
                    <span className="rounded-[2px] border border-ink/25 bg-cream" style={{ width: (f.widthMm / 210) * 44, height: (f.heightMm / 210) * 44 }} />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">{m.catalog.formats[f.id]}</span>
                    <span className="block text-sm text-muted">{t.formatHints[f.id]}</span>
                  </span>
                </span>
              </ChoiceRow>
            ))}
          </div>
        </Panel>

        {kind === "autobiography" ? (
          <Panel id="narrator" title={t.narrator} description={t.narratorText}>
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
                <p className="hint">{t.recordedByHint}</p>
              </div>
            </div>
          </Panel>
        ) : null}

        {kind === "blank" ? (
          <Panel id="recipient" title={t.optionalRecipient} description={t.optionalRecipientText}>
            <input className="input max-w-md" aria-label={t.optionalRecipient} value={s.recipientName} maxLength={60} placeholder={t.optionalRecipientPlaceholder} onChange={(e) => update({ recipientName: e.target.value })} disabled={!editable} />
          </Panel>
        ) : null}

        {kind === "gift" ? (
          // Подарок: формулировки склоняются по роду автора и получателя. У автобиографии род рассказчика — выше, у своей книги склоняемых текстов нет.
          <Panel id="wording" title={t.wording} description={t.wordingText}>
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
          </Panel>
        ) : null}

        {footer}
      </div>
    </div>
  );
}

/** Строка выбора: выбранная — рамка цвета переплёта; радиокнопка по ARIA. */
function ChoiceRow({ on, onClick, disabled, children }: { on: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      disabled={disabled}
      className={cn("flex items-start gap-3 rounded-[10px] border p-3.5 text-left transition-colors disabled:cursor-default disabled:opacity-60", on ? "border-wine bg-rose/25 ring-2 ring-wine/15" : "border-line-strong bg-white hover:border-ink/35")}
    >
      <span aria-hidden className={cn("mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full border-2", on ? "border-wine" : "border-line-strong")}>
        {on ? <span className="size-2 rounded-full bg-wine" /> : null}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}

function Toggle({ value, onChange, labels, disabled }: { value: Gender; onChange: (g: Gender) => void; labels: [string, string]; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-[12px] bg-sunken p-1">
      {(["m", "f"] as const).map((g, i) => (
        <button key={g} type="button" disabled={disabled} onClick={() => onChange(g)} className={cn("h-11 rounded-[10px] text-sm font-medium transition sm:h-10", value === g ? "bg-white shadow-soft" : "text-muted hover:text-ink")}>
          {labels[i]}
        </button>
      ))}
    </div>
  );
}
