"use client";

import { useMemo, useState } from "react";
import { useLocale } from "@/i18n/client";
import { dateFor } from "@/i18n/messages/partial";
import { toolUi } from "@/lib/content/tools/ui";
import { anniversaryDate, daysBetween, milestones, nextNamedAnniversary, parseDay, togetherStats, weddingName } from "@/lib/tools/together";
import { cn } from "@/lib/class-names";
import { Choice, CopyButton, Figure, ResultEmpty, ToolField, Workbench } from "./Workbench";

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
    <Workbench
      input={
        <>
          <ToolField label={ui.dateLabel} htmlFor="together-date">
            <input
              id="together-date"
              type="date"
              className="input"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setNow(new Date());
              }}
            />
          </ToolField>
          <ToolField label={ui.modeLabel}>
            <Choice
              label={ui.modeLabel}
              value={mode}
              onChange={setMode}
              options={[
                { id: "relationship", label: ui.modeRelationship },
                { id: "wedding", label: ui.modeWedding },
              ]}
            />
          </ToolField>
        </>
      }
      result={
        <div aria-live="polite">
          {!value || !start ? (
            <ResultEmpty>{ui.empty}</ResultEmpty>
          ) : future ? (
            <ResultEmpty>{ui.future}</ResultEmpty>
          ) : stats ? (
            <div>
              <Figure value={stats.days.toLocaleString("ru-RU")} caption={ui.daysTogether(stats.days)} />
              <div className="mt-4 text-ink">{breakdown}</div>
              <div className="mt-1 text-sm text-muted">{ui.extra(stats.weeks, stats.hours)}</div>

              {wedding ? (
                <div className="mt-5 space-y-1 border-l-[3px] border-wine bg-rose px-4 py-3 text-sm leading-relaxed text-ink">
                  {nowName ? <p className="font-medium">{ui.weddingNow(stats.years, nowName)}</p> : null}
                  {next ? (
                    <p className="text-ink-soft">
                      {ui.weddingNext(next.year, next[locale])} {fmt(anniversaryDate(start, next.year), true)}.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <h3 className="mt-7 font-serif text-2xl font-medium">{ui.nextTitle}</h3>
              <ul className="mt-2 divide-y divide-line border-y border-line">
                {list.map((m) => (
                  <li key={`${m.kind}-${m.value}`} className="flex items-center justify-between gap-4 py-3 text-sm">
                    <div>
                      <div className="font-medium text-ink">{ui.milestone(m.kind, m.value)}</div>
                      <div className="text-muted">{fmt(m.date, true)}</div>
                    </div>
                    <div className={cn("text-right", m.inDays < 0 ? "text-muted" : m.inDays === 0 ? "font-semibold text-wine" : "text-ink-soft")}>
                      {m.inDays < 0 ? ui.done : m.inDays === 0 ? ui.today : ui.inDays(m.inDays)}
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-5">
                <CopyButton text={ui.shareText(stats.days, breakdown)} label={ui.copy} done={ui.copied} />
              </div>
            </div>
          ) : null}
        </div>
      }
    />
  );
}
