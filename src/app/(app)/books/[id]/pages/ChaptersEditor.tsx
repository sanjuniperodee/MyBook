"use client";

import { RotateCcw, Undo2, X } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { GALLERY_KEY, isRemovedChapter, TOC_TITLE_MAX, type SampleTocCandidate, type TocLines, type TocLineSetting } from "@/lib/book/toc";
import { cn } from "@/lib/class-names";

/**
 * Главы книги: своё название (во всей книге — начальная полоса, колонтитул, оглавление) и «убрать главу» — страницы
 * с её названием не будет, истории перейдут в предыдущую главу. Видно всегда, даже без страницы «Содержание».
 * Настройки — те же строки глав (toc.ts, ключ `c:<глава>`), сборку книги делает layout.ts (foldChapters).
 */
export function ChaptersEditor({
  candidates,
  lines,
  editable,
  onChange,
}: {
  /** Строки книги из образца разворота: главы (и убранные — folded) и истории по порядку. */
  candidates: readonly SampleTocCandidate[];
  lines: TocLines;
  editable: boolean;
  onChange: (lines: TocLines) => void;
}) {
  const t = useMessages().books.pages;
  const chapters = candidates.filter((c) => c.kind === "chapter" && c.pageKey !== GALLERY_KEY);
  const stories = (key: string) => candidates.filter((c) => c.kind === "section" && c.parent === key).length;
  if (!chapters.length || chapters.every((c) => c.key.startsWith("c:planned-"))) return <p className="text-sm text-muted">{t.chaptersLater}</p>;

  const setLine = (key: string, patch: TocLineSetting) => {
    const next = { ...lines[key], ...patch };
    const clean: TocLineSetting = {};
    if (next.title) clean.title = next.title.slice(0, TOC_TITLE_MAX);
    if (next.hidden) clean.hidden = true;
    const rest = { ...lines };
    delete rest[key];
    onChange(clean.title !== undefined || clean.hidden ? { ...rest, [key]: clean } : rest);
  };

  const rows = chapterRows(chapters, lines, stories);
  const removedCount = rows.filter((r) => r.removed).length;

  return (
    <div>
      {removedCount ? <p className="mb-2 text-xs text-muted">{t.chaptersRemovedCount(removedCount)}</p> : null}
      <ul className="space-y-2">
        {rows.map(({ c, removed, number, into, count }) => {
          const s = lines[c.key];
          return (
            <li key={c.key} className={cn("rounded-2xl p-3 ring-1 transition", removed ? "bg-cream/60 ring-line/60" : "bg-white ring-line")}>
              <div className="flex items-center gap-2">
                <span className="w-7 shrink-0 text-right text-sm text-muted tabular-nums">{number ? `${number}.` : "—"}</span>
                <input
                  className={cn("input h-10 min-w-0 flex-1 text-sm font-medium", removed && "line-through opacity-50")}
                  value={s?.title ?? ""}
                  placeholder={c.label}
                  maxLength={TOC_TITLE_MAX}
                  aria-label={t.chapterNameAria(c.label)}
                  onChange={(e) => setLine(c.key, { title: e.target.value })}
                  disabled={!editable || removed}
                />
                {s?.title && !removed ? (
                  <button type="button" className="shrink-0 rounded-lg p-2.5 text-muted hover:bg-cream hover:text-ink disabled:opacity-50 sm:p-1.5" title={t.chapterNameReset} aria-label={t.chapterNameReset} onClick={() => setLine(c.key, { title: "" })} disabled={!editable}>
                    <RotateCcw className="size-4" />
                  </button>
                ) : null}
                {c.first ? null : removed ? (
                  <button type="button" className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-wine hover:bg-white disabled:opacity-50" onClick={() => setLine(c.key, { hidden: false })} disabled={!editable}>
                    <Undo2 className="size-4" /> {t.chapterRestore}
                  </button>
                ) : (
                  <button type="button" className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-muted hover:bg-cream hover:text-ink disabled:opacity-50" onClick={() => setLine(c.key, { hidden: true })} disabled={!editable}>
                    <X className="size-4" /> {t.chapterRemove}
                  </button>
                )}
              </div>
              <p className="mt-1.5 pl-9 text-xs text-muted">
                {removed ? (into ? t.chapterMovedInto(count, into) : t.chapterRemovedNoHost) : c.first ? `${t.chapterStories(count)} · ${t.chapterFirst}` : t.chapterStories(count)}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Номер главы и куда уйдут истории убранной — по текущим правкам, ещё до сохранения. */
function chapterRows(chapters: readonly SampleTocCandidate[], lines: TocLines, stories: (key: string) => number) {
  const rows: { c: SampleTocCandidate; removed: boolean; number: number | null; into: string; count: number }[] = [];
  let no = 0;
  let host = "";
  for (const c of chapters) {
    const removed = isRemovedChapter(c, lines);
    if (!removed) {
      no += 1;
      host = lines[c.key]?.title?.trim() || c.label;
    }
    rows.push({ c, removed, number: removed ? null : no, into: removed ? host : "", count: stories(c.key) });
  }
  return rows;
}
