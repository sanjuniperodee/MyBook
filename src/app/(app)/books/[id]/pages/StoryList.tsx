"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Eye, EyeOff, RotateCcw } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { apiFetch } from "@/lib/client-api";
import { cn } from "@/lib/class-names";

/** История для правки: заголовок по умолчанию, свой заголовок (null — по умолчанию) и скрыт ли он в книге. */
export interface StoryInfo {
  title: string;
  displayText: string | null;
  hidden: boolean;
}

/** Строка истории в главе: id ответа (book_questions) — ключ строки без «q:». */
export interface StoryRow {
  id: string;
  /** Письмо близкого: его подпись — текст автора письма, переносить и переименовывать здесь нельзя. */
  letter: boolean;
}

const HEADING_MAX = 200;

/**
 * Истории внутри главы: заголовок — во всей книге (как в редакторе вопросов), скрыть заголовок, выше/ниже в главе
 * и перенести в другую главу. Заголовки сохраняются сами через секунду после правки; перенос — сразу, затем страница
 * перечитывает образец книги (порядок историй и номера страниц считает сервер).
 */
export function StoryList({
  bookId,
  rows,
  stories,
  chapterKey,
  targets,
  editable,
}: {
  bookId: string;
  rows: readonly StoryRow[];
  stories: Readonly<Record<string, StoryInfo>>;
  /** Ключ главы (без «c:»). */
  chapterKey: string;
  /** Куда можно перенести: оставшиеся главы книги (ключ без «c:» и название). */
  targets: readonly { key: string; title: string }[];
  editable: boolean;
}) {
  const t = useMessages().books.pages;
  const router = useRouter();
  const [local, setLocal] = useState<Record<string, Partial<StoryInfo>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(new Map<string, Partial<Pick<StoryInfo, "displayText" | "hidden">>>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const batch = [...pending.current.entries()];
    pending.current.clear();
    if (!batch.length) return;
    try {
      for (const [id, patch] of batch)
        await apiFetch(`/api/books/${bookId}/questions/${id}`, {
          method: "PATCH",
          json: { ...(patch.displayText !== undefined ? { displayText: patch.displayText } : {}), ...(patch.hidden !== undefined ? { hideHeading: patch.hidden } : {}) },
        });
      setError(null);
      router.refresh();
    } catch {
      setError(t.storySaveError);
    }
  };
  // Уходя со страницы — дописать несохранённое.
  useEffect(() => () => void flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (id: string, p: Partial<Pick<StoryInfo, "displayText" | "hidden">>) => {
    if (!editable) return;
    setLocal((s) => ({ ...s, [id]: { ...s[id], ...p } }));
    pending.current.set(id, { ...pending.current.get(id), ...p });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 1000);
  };

  const move = async (id: string, chapter: string, beforeId: string | null) => {
    if (!editable || busy) return;
    setBusy(true);
    await flush();
    try {
      await apiFetch(`/api/books/${bookId}/questions/${id}/move`, { method: "POST", json: { chapter, beforeId } });
      setError(null);
      router.refresh();
    } catch {
      setError(t.storyMoveError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 space-y-2 border-t border-line/70 pt-3">
      {error ? <p className="text-xs text-wine">{error}</p> : null}
      {rows.map((row, i) => {
        const info = stories[row.id];
        if (row.letter || !info)
          return (
            <div key={row.id} className="pl-9 text-sm text-muted">
              {t.storyLetter}
            </div>
          );
        const cur = { ...info, ...local[row.id] };
        const value = cur.displayText ?? "";
        const prev = rows[i - 1];
        const next = rows[i + 1];
        const afterNext = rows[i + 2];
        return (
          <div key={row.id} className="pl-9">
            <div className="flex items-center gap-1.5">
              <input
                className={cn("input h-9 min-w-0 flex-1 text-sm", cur.hidden && "line-through opacity-50")}
                value={value}
                placeholder={info.title}
                maxLength={HEADING_MAX}
                aria-label={t.storyHeadingAria(info.title)}
                onChange={(e) => patch(row.id, { displayText: e.target.value || null })}
                onBlur={() => void flush()}
                disabled={!editable || busy}
              />
              {value ? (
                <IconButton label={t.storyHeadingReset} onClick={() => patch(row.id, { displayText: null })} disabled={!editable || busy}>
                  <RotateCcw className="size-4" />
                </IconButton>
              ) : null}
              <IconButton label={cur.hidden ? t.storyHeadingShow : t.storyHeadingHide} onClick={() => patch(row.id, { hidden: !cur.hidden })} disabled={!editable || busy} pressed={cur.hidden}>
                {cur.hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </IconButton>
              <IconButton label={t.storyUp} onClick={() => prev && void move(row.id, chapterKey, prev.id)} disabled={!editable || busy || !prev || prev.letter}>
                <ArrowUp className="size-4" />
              </IconButton>
              <IconButton label={t.storyDown} onClick={() => next && void move(row.id, chapterKey, afterNext?.id ?? null)} disabled={!editable || busy || !next || next.letter}>
                <ArrowDown className="size-4" />
              </IconButton>
            </div>
            {targets.length ? (
              <select
                className="mt-1 h-8 max-w-full rounded-lg bg-transparent text-xs text-muted hover:text-ink disabled:opacity-50"
                value=""
                aria-label={t.storyMoveAria(info.title)}
                onChange={(e) => e.target.value && void move(row.id, e.target.value, null)}
                disabled={!editable || busy}
              >
                <option value="">{t.storyMoveTo}</option>
                {targets.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.title}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function IconButton({ label, onClick, disabled, pressed, children }: { label: string; onClick: () => void; disabled?: boolean; pressed?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="shrink-0 rounded-lg p-2 text-muted hover:bg-cream hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
