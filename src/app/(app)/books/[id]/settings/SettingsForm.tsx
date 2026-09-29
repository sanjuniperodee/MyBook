"use client";

import { useRef, useState } from "react";
import { Check } from "lucide-react";
import { SaveIndicator } from "@/components/SaveIndicator";
import { useAutosave } from "@/hooks/useAutosave";
import { apiFetch } from "@/lib/client-api";
import { typographies, cssFont, type TypographyId } from "@/lib/book/fonts";
import { formats, type FormatId } from "@/lib/book/formats";
import { cn } from "@/lib/utils";
import type { Gender } from "@/lib/db/schema";

export interface SettingsState {
  typography: TypographyId;
  format: FormatId;
  dedication: string;
  photoPlacement: "chapters" | "end";
  showToc: boolean;
  authorGender: Gender;
  recipientGender: Gender;
}

export function SettingsForm({ bookId, initial, fixedRecipientGender, editable }: { bookId: string; initial: SettingsState; fixedRecipientGender: boolean; editable: boolean }) {
  const [s, setS] = useState(initial);
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

      <Section title="Стиль вёрстки" description="Шрифты заголовков и основного текста во всей книге.">
        <div className="grid gap-4 sm:grid-cols-3">
          {Object.values(typographies).map((t) => (
            <Choice key={t.id} active={s.typography === t.id} onClick={() => update({ typography: t.id })} disabled={!editable}>
              <div style={{ fontFamily: cssFont(t.heading), fontStyle: t.headingItalic ? "italic" : "normal", fontWeight: t.headingWeight }} className="text-2xl">
                Как мы познакомились
              </div>
              <p style={{ fontFamily: cssFont(t.body) }} className="mt-2 text-[13px] leading-relaxed text-ink-soft">
                Мы встретились в самый обычный вторник, когда шёл первый снег…
              </p>
              <div className="mt-4 text-sm font-medium">{t.name}</div>
              <div className="text-xs text-muted">{t.description}</div>
            </Choice>
          ))}
        </div>
      </Section>

      <Section title="Формат книги">
        <div className="grid gap-4 sm:grid-cols-2">
          {Object.values(formats).map((f) => (
            <Choice key={f.id} active={s.format === f.id} onClick={() => update({ format: f.id })} disabled={!editable}>
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-end justify-center">
                  <div className="rounded-[2px] border border-ink/20 bg-cream" style={{ width: (f.widthMm / 210) * 60, height: (f.heightMm / 210) * 60 }} />
                </div>
                <div>
                  <div className="font-medium">{f.name}</div>
                  <div className="text-sm text-muted">{f.id === "a5" ? "Как классическая книга, удобно читать" : "Больше места для фотографий"}</div>
                </div>
              </div>
            </Choice>
          ))}
        </div>
      </Section>

      <Section title="Посвящение" description="Короткие слова на отдельной странице в начале книги. Необязательно.">
        <textarea
          className="input"
          rows={3}
          maxLength={600}
          value={s.dedication}
          onChange={(e) => update({ dedication: e.target.value })}
          placeholder="Например: «Моему самому близкому человеку — с любовью»"
          disabled={!editable}
        />
      </Section>

      <Section title="Фотографии в книге">
        <div className="grid gap-4 sm:grid-cols-2">
          <Choice active={s.photoPlacement === "chapters"} onClick={() => update({ photoPlacement: "chapters" })} disabled={!editable}>
            <div className="font-medium">Между главами</div>
            <div className="text-sm text-muted">Фото равномерно распределяются по книге</div>
          </Choice>
          <Choice active={s.photoPlacement === "end"} onClick={() => update({ photoPlacement: "end" })} disabled={!editable}>
            <div className="font-medium">Отдельной главой в конце</div>
            <div className="text-sm text-muted">Раздел «Наши моменты»</div>
          </Choice>
        </div>
      </Section>

      <Section title="Оглавление">
        <label className="flex items-center gap-3">
          <input type="checkbox" className="size-5 accent-wine" checked={s.showToc} onChange={(e) => update({ showToc: e.target.checked })} disabled={!editable} />
          <span>Добавить страницу «Содержание» с номерами страниц глав</span>
        </label>
      </Section>

      <Section title="Формулировки" description="Вопросы и заголовки подстраиваются под род: «ты увидел» или «ты увидела».">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <span className="label">Автор книги</span>
            <Toggle value={s.authorGender} onChange={(g) => update({ authorGender: g })} labels={["Мужчина", "Женщина"]} disabled={!editable} />
          </div>
          {!fixedRecipientGender ? (
            <div>
              <span className="label">Книга для</span>
              <Toggle value={s.recipientGender} onChange={(g) => update({ recipientGender: g })} labels={["Него", "Неё"]} disabled={!editable} />
            </div>
          ) : null}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section>
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
