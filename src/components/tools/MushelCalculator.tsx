"use client";

import { useMemo, useState } from "react";
import { useLocale } from "@/i18n/client";
import { usefulUi2 } from "@/lib/content/tools/ui";
import { mushelInfo } from "@/lib/tools/mushel";
import { daysBetween, parseDay } from "@/lib/tools/together";
import { cn } from "@/lib/class-names";
import { CopyButton, ResultEmpty, ToolField, Workbench } from "./Workbench";

/** Мүшел жас по дате рождения: животное года, возраст и все семь кругов. «Сейчас» берётся при вводе даты — без расхождения сервера и браузера. */
export function MushelCalculator() {
  const ui = usefulUi2[useLocale()].mushel;
  const [value, setValue] = useState("");
  const [now, setNow] = useState<Date | null>(null);

  const birth = parseDay(value);
  const future = !!(birth && now && daysBetween(birth, now) < 0);
  const info = useMemo(() => (birth && now && !future ? mushelInfo(birth.getFullYear(), birth.getMonth() + 1, birth.getDate(), now) : null), [birth, now, future]);
  const current = info?.rounds.find((r) => r.state === "current");
  const yearNow = now?.getFullYear() ?? 0;
  const nextText = info ? (current ? ui.currentMushel(current.traditionalAge) : info.next ? ui.nextMushel(info.next.year, info.next.traditionalAge, info.next.year - yearNow) : ui.noMore) : "";

  return (
    <Workbench
      input={
        <>
          <ToolField label={ui.birthLabel} htmlFor="mushel-date">
            <input
              id="mushel-date"
              type="date"
              className="input"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setNow(new Date());
              }}
            />
          </ToolField>
          <p className="text-xs leading-relaxed text-muted">{ui.note}</p>
        </>
      }
      result={
        <div aria-live="polite">
          {!value || !birth ? (
            <ResultEmpty>{ui.empty}</ResultEmpty>
          ) : future ? (
            <ResultEmpty>{ui.future}</ResultEmpty>
          ) : info ? (
            <div>
              <div className="text-sm text-muted">{ui.yourAnimal}</div>
              <div className="mt-1 font-serif text-[48px] leading-none font-medium text-wine sm:text-[64px]" data-testid="mushel-animal">
                {ui.animal[info.animal]}
              </div>
              <p className="mt-3 text-ink">{ui.age(info.age, info.traditionalAge)}</p>
              <p className={cn("mt-2", current ? "font-semibold text-wine" : "text-ink-soft")} data-testid="mushel-next">
                {nextText}
              </p>

              <h3 className="mt-7 font-serif text-2xl font-medium">{ui.tableTitle}</h3>
              <ul className="mt-2 divide-y divide-line border-y border-line">
                {info.rounds.map((r) => (
                  <li key={r.n} className={cn("flex items-center justify-between gap-4 py-3 text-sm", r.state === "current" && "-mx-3 bg-rose px-3")}>
                    <div>
                      <div className="font-medium text-ink">{ui.round(r.n, r.traditionalAge)}</div>
                      <div className="text-muted">{ui.roundMeta(r.year, r.age)}</div>
                    </div>
                    <div className={cn("text-right", r.state === "past" ? "text-muted" : r.state === "current" ? "font-semibold text-wine" : "text-ink-soft")}>{ui.state[r.state]}</div>
                  </li>
                ))}
              </ul>
              <div className="mt-5">
                <CopyButton text={ui.shareText(ui.animal[info.animal], nextText)} label={ui.copy} done={ui.copied} />
              </div>
            </div>
          ) : null}
        </div>
      }
    />
  );
}
