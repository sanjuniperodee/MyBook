"use client";

import { useMemo, useState } from "react";
import { Cake } from "lucide-react";
import { useLocale } from "@/i18n/client";
import { usefulUi2 } from "@/lib/content/tools/ui";
import { mushelInfo } from "@/lib/tools/mushel";
import { daysBetween, parseDay } from "@/lib/tools/together";
import { cn } from "@/lib/class-names";
import { CopyButton } from "./Choice";

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
    <div className="card p-6 sm:p-8">
      <label className="label" htmlFor="mushel-date">
        {ui.birthLabel}
      </label>
      <input
        id="mushel-date"
        type="date"
        className="input max-w-xs"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setNow(new Date());
        }}
      />

      <div aria-live="polite" className="mt-6">
        {!value || !birth ? (
          <p className="rounded-2xl bg-cream/60 px-5 py-6 text-center text-muted">{ui.empty}</p>
        ) : future ? (
          <p className="rounded-2xl bg-rose/40 px-5 py-6 text-center text-ink-soft">{ui.future}</p>
        ) : info ? (
          <div>
            <div className="rounded-3xl bg-gradient-to-br from-rose/60 to-cream px-6 py-8 text-center">
              <Cake className="mx-auto size-6 text-wine" aria-hidden />
              <div className="mt-2 text-xs font-semibold tracking-[0.18em] text-wine uppercase">{ui.yourAnimal}</div>
              <div className="mt-1 font-serif text-4xl font-medium text-wine sm:text-5xl" data-testid="mushel-animal">
                {ui.animal[info.animal]}
              </div>
              <p className="mt-3 text-ink">{ui.age(info.age, info.traditionalAge)}</p>
              <p className={cn("mx-auto mt-2 max-w-xl", current ? "font-semibold text-wine" : "text-ink-soft")} data-testid="mushel-next">
                {nextText}
              </p>
            </div>

            <h3 className="mt-8 font-serif text-2xl font-medium">{ui.tableTitle}</h3>
            <ul className="mt-3 divide-y divide-line/70 rounded-2xl border border-line bg-white">
              {info.rounds.map((r) => (
                <li key={r.n} className={cn("flex items-center justify-between gap-4 px-5 py-3 text-sm", r.state === "current" && "bg-rose/30")}>
                  <div>
                    <div className="font-medium text-ink">{ui.round(r.n, r.traditionalAge)}</div>
                    <div className="text-muted">{ui.roundMeta(r.year, r.age)}</div>
                  </div>
                  <div className={cn(r.state === "past" ? "text-muted" : r.state === "current" ? "font-semibold text-wine" : "text-ink-soft")}>{ui.state[r.state]}</div>
                </li>
              ))}
            </ul>
            <div className="mt-5">
              <CopyButton text={ui.shareText(ui.animal[info.animal], nextText)} label={ui.copy} done={ui.copied} />
            </div>
          </div>
        ) : null}
      </div>
      <p className="mt-6 text-xs leading-relaxed text-muted">{ui.note}</p>
    </div>
  );
}
