"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useLocale } from "@/i18n/client";
import { toolUi } from "@/lib/content/tools/ui";
import { generateGreeting, occasionsFor, recipientIds, type OccasionId, type RecipientId, type ToneId } from "@/lib/tools/greeting";
import { Choice, CopyButton } from "./Choice";

export function GreetingGenerator() {
  const locale = useLocale();
  const ui = toolUi[locale].greeting;
  const [recipient, setRecipient] = useState<RecipientId>("mama");
  const [occasionPick, setOccasion] = useState<OccasionId>("birthday");
  const [tone, setTone] = useState<ToneId>("warm");
  const [length, setLength] = useState<"full" | "short">("full");
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [variant, setVariant] = useState(0);

  const occasions = occasionsFor(recipient);
  // Повод, неуместный новому адресату (8 Марта для мужчины), заменяется первым подходящим.
  const occasion = occasions.includes(occasionPick) ? occasionPick : occasions[0];
  const years = Number(age);
  const text = generateGreeting({ locale, recipient, occasion, tone, name, age: occasion === "jubilee" && Number.isInteger(years) ? years : null, short: length === "short", variant });

  return (
    <div className="card p-6 sm:p-8">
      <div className="space-y-6">
        <div>
          <span className="label">{ui.whoLabel}</span>
          <Choice
            label={ui.whoLabel}
            value={recipient}
            onChange={(v) => {
              setRecipient(v);
              setVariant(0);
            }}
            options={recipientIds.map((id) => ({ id, label: ui.recipient[id] }))}
          />
        </div>
        <div>
          <span className="label">{ui.occasionLabel}</span>
          <Choice
            label={ui.occasionLabel}
            value={occasion}
            onChange={(v) => {
              setOccasion(v);
              setVariant(0);
            }}
            options={occasions.map((id) => ({ id, label: ui.occasion[id] }))}
          />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <span className="label">{ui.toneLabel}</span>
            <Choice label={ui.toneLabel} value={tone} onChange={setTone} options={(["warm", "funny"] as const).map((id) => ({ id, label: ui.tone[id] }))} />
          </div>
          <div>
            <span className="label">{ui.lengthLabel}</span>
            <Choice label={ui.lengthLabel} value={length} onChange={setLength} options={(["full", "short"] as const).map((id) => ({ id, label: ui.length[id] }))} />
          </div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="greeting-name">
              {ui.nameLabel}
            </label>
            <input id="greeting-name" className="input" maxLength={40} value={name} placeholder={ui.namePlaceholder} onChange={(e) => setName(e.target.value)} />
          </div>
          {occasion === "jubilee" ? (
            <div>
              <label className="label" htmlFor="greeting-age">
                {ui.ageLabel}
              </label>
              <input id="greeting-age" className="input" inputMode="numeric" maxLength={3} value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))} />
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-8 rounded-3xl bg-gradient-to-br from-cream to-rose/40 p-6 sm:p-8">
        <h3 className="text-xs font-semibold tracking-[0.18em] text-wine uppercase">{ui.resultTitle}</h3>
        <p className="mt-4 font-serif text-xl leading-relaxed whitespace-pre-line text-ink sm:text-2xl" data-testid="greeting-text" aria-live="polite">
          {text}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setVariant((v) => v + 1)}>
            <RefreshCw className="size-4" /> {ui.another}
          </button>
          <CopyButton text={text} label={ui.copy} done={ui.copied} />
        </div>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-muted">{ui.hint}</p>
    </div>
  );
}
