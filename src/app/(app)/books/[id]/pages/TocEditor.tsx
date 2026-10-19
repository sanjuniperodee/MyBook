"use client";

import { Eye, EyeOff, RotateCcw } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { Choice } from "@/components/ui/Choice";
import { inMode, TOC_MODES, TOC_TITLE_MAX, type SampleTocCandidate, type TocLines, type TocLineSetting, type TocMode } from "@/lib/book/toc";
import { cn } from "@/lib/class-names";

/**
 * Оглавление по-своему: режим (по главам, по заголовкам историй, главы с историями) и каждая строка —
 * своё название или «скрыть». Правки меняют только оглавление; превью разворота обновляется сразу.
 */
export function TocEditor({
  candidates,
  mode,
  lines,
  editable,
  onChange,
  onFocus,
}: {
  /** Все строки книги, которые могут попасть в оглавление (из образца разворота). */
  candidates: readonly SampleTocCandidate[];
  mode: TocMode;
  lines: TocLines;
  editable: boolean;
  onChange: (patch: { tocMode?: TocMode; tocLines?: TocLines }) => void;
  /** Показать разворот «Оглавление». */
  onFocus: () => void;
}) {
  const t = useMessages().books.pages;
  // Пока ответов нет, в образце — главы темы-примера: их настройки не к чему привязать.
  const real = candidates.some((c) => !c.key.startsWith("c:planned-"));
  const shown = real ? candidates.filter((c) => inMode(c, mode)) : [];
  const hidden = shown.filter((c) => lines[c.key]?.hidden).length;

  const setLine = (key: string, patch: TocLineSetting) => {
    const next = { ...lines[key], ...patch };
    const clean: TocLineSetting = {};
    if (next.title !== undefined && next.title !== "") clean.title = next.title.slice(0, TOC_TITLE_MAX);
    if (next.hidden) clean.hidden = true;
    const rest = { ...lines };
    delete rest[key];
    onChange({ tocLines: clean.title !== undefined || clean.hidden ? { ...rest, [key]: clean } : rest });
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {TOC_MODES.map((id) => (
          <Choice
            key={id}
            active={mode === id}
            onClick={() => {
              onChange({ tocMode: id });
              onFocus();
            }}
            disabled={!editable}
          >
            <div className="font-medium">{t.tocModes[id].title}</div>
            <div className="text-sm text-muted">{t.tocModes[id].text}</div>
          </Choice>
        ))}
      </div>

      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-medium">{t.tocLines}</h3>
          {Object.keys(lines).length ? (
            <button type="button" className="text-sm text-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-50" onClick={() => onChange({ tocLines: {} })} disabled={!editable}>
              {t.tocResetAll}
            </button>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted">{real ? t.tocLinesText : t.tocLinesLater}</p>
        {hidden ? <p className="mt-1 text-xs text-muted">{t.tocHiddenCount(hidden)}</p> : null}
        {shown.length ? (
          <ul className="mt-3 max-h-[30rem] space-y-1.5 overflow-y-auto pr-1">
            {shown.map((c) => {
              const s = lines[c.key];
              const nested = mode === "both" && c.kind === "section";
              const number = mode !== "sections" && c.number ? `${c.number}.` : null;
              const name = s?.title || c.label;
              return (
                <li key={c.key} className={cn("flex items-center gap-2", nested && "pl-6")}>
                  {number ? <span className="w-6 shrink-0 text-right text-sm text-muted tabular-nums">{number}</span> : null}
                  <input
                    className={cn("input h-10 min-w-0 flex-1 text-sm", s?.hidden && "line-through opacity-50", c.kind === "chapter" && !nested && "font-medium")}
                    value={s?.title ?? ""}
                    placeholder={c.label || t.tocNoHeading}
                    maxLength={TOC_TITLE_MAX}
                    aria-label={t.tocLineAria(name || t.tocNoHeading)}
                    onChange={(e) => setLine(c.key, { title: e.target.value })}
                    onBlur={(e) => {
                      if (!e.target.value.trim() && s?.title !== undefined) setLine(c.key, { title: "" });
                    }}
                    onFocus={onFocus}
                    disabled={!editable}
                  />
                  {s?.title ? (
                    <button type="button" className="shrink-0 rounded-lg p-2.5 text-muted hover:bg-cream hover:text-ink disabled:opacity-50 sm:p-1.5" title={t.tocReset} aria-label={t.tocReset} onClick={() => setLine(c.key, { title: "" })} disabled={!editable}>
                      <RotateCcw className="size-4" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="shrink-0 rounded-lg p-2.5 text-muted hover:bg-cream hover:text-ink disabled:opacity-50 sm:p-1.5"
                    title={s?.hidden ? t.tocShow : t.tocHide}
                    aria-label={s?.hidden ? t.tocShow : t.tocHide}
                    aria-pressed={!!s?.hidden}
                    onClick={() => {
                      setLine(c.key, { hidden: !s?.hidden });
                      onFocus();
                    }}
                    disabled={!editable}
                  >
                    {s?.hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
