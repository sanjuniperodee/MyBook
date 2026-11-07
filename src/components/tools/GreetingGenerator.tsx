"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useLocale } from "@/i18n/client";
import { toolUi } from "@/lib/content/tools/ui";
import { generateGreeting, occasionsFor, recipientIds, type OccasionId, type RecipientId, type ToneId } from "@/lib/tools/greeting";
import { Choice, CopyButton, ToolField, Workbench } from "./Workbench";

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
    <Workbench
      input={
        <>
          <ToolField label={ui.whoLabel}>
            <Choice
              label={ui.whoLabel}
              value={recipient}
              onChange={(v) => {
                setRecipient(v);
                setVariant(0);
              }}
              options={recipientIds.map((id) => ({ id, label: ui.recipient[id] }))}
            />
          </ToolField>
          <ToolField label={ui.occasionLabel}>
            <Choice
              label={ui.occasionLabel}
              value={occasion}
              onChange={(v) => {
                setOccasion(v);
                setVariant(0);
              }}
              options={occasions.map((id) => ({ id, label: ui.occasion[id] }))}
            />
          </ToolField>
          <div className="grid gap-6 sm:grid-cols-2">
            <ToolField label={ui.toneLabel}>
              <Choice label={ui.toneLabel} value={tone} onChange={setTone} options={(["warm", "funny"] as const).map((id) => ({ id, label: ui.tone[id] }))} />
            </ToolField>
            <ToolField label={ui.lengthLabel}>
              <Choice label={ui.lengthLabel} value={length} onChange={setLength} options={(["full", "short"] as const).map((id) => ({ id, label: ui.length[id] }))} />
            </ToolField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <ToolField label={ui.nameLabel} htmlFor="greeting-name">
              <input id="greeting-name" className="input" maxLength={40} value={name} placeholder={ui.namePlaceholder} onChange={(e) => setName(e.target.value)} />
            </ToolField>
            {occasion === "jubilee" ? (
              <ToolField label={ui.ageLabel} htmlFor="greeting-age">
                <input id="greeting-age" className="input" inputMode="numeric" maxLength={3} value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))} />
              </ToolField>
            ) : null}
          </div>
        </>
      }
      result={
        <div>
          {/* Открытка: белый лист с тонкой внутренней рамкой, текст засечками. */}
          <div className="relative rounded-[10px] border border-line bg-white p-6 sm:p-8">
            <div aria-hidden className="pointer-events-none absolute inset-1.5 rounded-[6px] border border-line/70" />
            <h3 className="relative text-sm text-muted">{ui.resultTitle}</h3>
            <p className="relative mt-3 font-serif text-xl leading-relaxed whitespace-pre-line text-ink sm:text-[26px] sm:leading-[1.45]" data-testid="greeting-text" aria-live="polite">
              {text}
            </p>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" className="btn btn-dark btn-sm" onClick={() => setVariant((v) => v + 1)}>
              <RefreshCw className="size-4" /> {ui.another}
            </button>
            <CopyButton text={text} label={ui.copy} done={ui.copied} />
          </div>
          <p className="mt-5 text-sm leading-relaxed text-muted">{ui.hint}</p>
        </div>
      }
    />
  );
}
