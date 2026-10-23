"use client";

import { useMemo, useState } from "react";
import { Heart } from "lucide-react";
import { useLocale } from "@/i18n/client";
import { dateFor } from "@/i18n/messages/partial";
import { toolUi } from "@/lib/content/tools/ui";
import { anniversaryDate, daysBetween, milestones, nextNamedAnniversary, parseDay, togetherStats, weddingName } from "@/lib/tools/together";
import { Choice, CopyButton } from "./Choice";

/** Счётчик дней вместе. «Сейчас» берётся после загрузки страницы, чтобы сервер и браузер рисовали одно и то же. */
export function TogetherCounter() {
  const locale = useLocale();
  const ui = toolUi[locale].together;
  const [value, setValue] = useState("");
  const [mode, setMode] = useState<"relationship" | "wedding">("relationship");
  const [now, setNow] = useState<Date | null>(null);

  const fmt = dateFor(locale);
  const start = parseDay(value);
  const future = !!(start && now && daysBetween(start, now) < 0);
  const stats = useMemo(() => (start && now && !future ? togetherStats(start, now) : null), [start, now, future]);
  const list = useMemo(() => (start && now && stats ? milestones(start, now) : []), [start, now, stats]);
  const breakdown = stats ? ui.breakdown(stats.years, stats.months, stats.restDays) : "";
  const wedding = stats && mode === "wedding" && stats.years >= 1;
  const nowName = wedding ? weddingName(stats.years, locale) : null;
  const next = stats && mode === "wedding" ? nextNamedAnniversary(stats.years + 1) : null;

  return (
    <div className="card p-6 sm:p-8">
      <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="together-date">
            {ui.dateLabel}
          </label>
          <input id="together-date" type="date" className="input" value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setNow(new Date());
            }} />
        </div>
        <Choice
          label={ui.modeLabel}
          value={mode}
          onChange={setMode}
          options={[
            { id: "relationship", label: ui.modeRelationship },
            { id: "wedding", label: ui.modeWedding },
          ]}
        />
      </div>

      <div aria-live="polite" className="mt-8">
        {!value || !start ? (
          <p className="rounded-2xl bg-cream/60 px-5 py-6 text-center text-muted">{ui.empty}</p>
        ) : future ? (
          <p className="rounded-2xl bg-rose/40 px-5 py-6 text-center text-ink-soft">{ui.future}</p>
        ) : stats ? (
          <div>
            <div className="rounded-3xl bg-gradient-to-br from-rose/60 to-cream px-6 py-8 text-center">
              <Heart className="mx-auto size-6 text-wine" aria-hidden />
              <div className="mt-3 font-serif text-6xl leading-none font-medium tracking-tight text-wine tabular-nums sm:text-7xl">{stats.days.toLocaleString("ru-RU")}</div>
              <div className="mt-2 text-lg text-ink-soft">{ui.daysTogether(stats.days)}</div>
              <div className="mt-4 text-ink">{breakdown}</div>
              <div className="mt-1 text-sm text-muted">{ui.extra(stats.weeks, stats.hours)}</div>
            </div>

            {wedding ? (
              <div className="mt-5 space-y-1 rounded-2xl border border-line bg-white px-5 py-4 text-sm leading-relaxed text-ink-soft">
                {nowName ? <p className="font-medium text-ink">{ui.weddingNow(stats.years, nowName)}</p> : null}
                {next ? (
                  <p>
                    {ui.weddingNext(next.year, next[locale])} {fmt(anniversaryDate(start, next.year), true)}.
                  </p>
                ) : null}
              </div>
            ) : null}

            <h3 className="mt-8 font-serif text-2xl font-medium">{ui.nextTitle}</h3>
            <ul className="mt-3 divide-y divide-line/70 rounded-2xl border border-line bg-white">
              {list.map((m) => (
                <li key={`${m.kind}-${m.value}`} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                  <div>
                    <div className="font-medium text-ink">{ui.milestone(m.kind, m.value)}</div>
                    <div className="text-muted">{fmt(m.date, true)}</div>
                  </div>
                  <div className={m.inDays < 0 ? "text-muted" : m.inDays === 0 ? "font-semibold text-wine" : "text-ink-soft"}>{m.inDays < 0 ? ui.done : m.inDays === 0 ? ui.today : ui.inDays(m.inDays)}</div>
                </li>
              ))}
            </ul>

            <div className="mt-5">
              <CopyButton text={ui.shareText(stats.days, breakdown)} label={ui.copy} done={ui.copied} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
