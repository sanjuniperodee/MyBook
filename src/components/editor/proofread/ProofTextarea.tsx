"use client";

import { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useRef, useState, type CSSProperties, type TextareaHTMLAttributes } from "react";
import { ArrowRight, BookPlus, Check, CheckCircle2, EyeOff, LoaderCircle, Sparkles, Wand2, X } from "lucide-react";
import { useMessages } from "@/i18n/client";
import type { Issue, IssueKind } from "@/lib/proofread/types";
import { issueKinds } from "@/lib/proofread/types";
import { cn } from "@/lib/class-names";
import { hexAlpha } from "@/lib/color";
import type { AiState } from "./useProofread";

/** Цвет замечания: красный — ошибка в слове, синий — запятые и грамматика, янтарный — оформление, фиолетовый — стиль. */
export const kindColor: Record<IssueKind, string> = {
  spelling: "#e11d48",
  punctuation: "#2563eb",
  grammar: "#2563eb",
  typography: "#d97706",
  style: "#7c3aed",
};

const issueId = (i: Issue) => `${i.start}:${i.key}`;

function markStyle(i: Issue, active: boolean): CSSProperties {
  const color = kindColor[i.kind];
  const blank = !i.end || !/\S/.test(i.key.split("|")[1] ?? "x");
  return {
    textDecorationLine: "underline",
    textDecorationStyle: i.kind === "typography" ? "dotted" : "wavy",
    textDecorationColor: color,
    textDecorationThickness: i.kind === "typography" ? "2px" : "1.5px",
    textUnderlineOffset: "5px",
    textDecorationSkipInk: "none",
    borderRadius: 3,
    background: active ? hexAlpha(color, 0.18) : blank ? hexAlpha(color, 0.14) : undefined,
  };
}

/** Текст с подчёркиваниями — копия текста поля под ним (сам текст прозрачный, видны только линии и подсветка). */
function Mirror({ value, issues, activeId, className, style }: { value: string; issues: Issue[]; activeId: string | null; className: string; style?: CSSProperties }) {
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const i of issues) {
    if (i.start < at) continue;
    if (i.start > at) parts.push(value.slice(at, i.start));
    const id = issueId(i);
    parts.push(
      <mark key={id} data-issue={id} className="bg-transparent text-transparent" style={markStyle(i, id === activeId)}>
        {value.slice(i.start, i.end) || "​"}
      </mark>,
    );
    at = i.end;
  }
  parts.push(value.slice(at));
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden break-words whitespace-pre-wrap text-transparent select-none", className)} style={style}>
      {parts}
      {/* Последний перевод строки textarea показывает пустой строкой — повторяем это. */}
      {"​"}
    </div>
  );
}

/** Фрагмент вокруг замечания: «…слово , слово…» и как станет после правки. */
function Preview({ text, issue, replacement }: { text: string; issue: Issue; replacement: string }) {
  const before = text.slice(Math.max(0, issue.start - 14), issue.start);
  const after = text.slice(issue.end, issue.end + 14);
  const show = (s: string) => s.replace(/ /g, "·").replace(/\n/g, "↵");
  const original = text.slice(issue.start, issue.end);
  return (
    <span className="min-w-0 break-words">
      <span className="text-muted">{before.replace(/^\S*\s/, "…").replace(/\n/g, " ")}</span>
      {original && original !== replacement ? <del className="rounded bg-rose-100 px-0.5 text-rose-700 decoration-rose-400">{show(original)}</del> : null}
      {replacement ? <ins className="rounded bg-emerald-100 px-0.5 font-medium text-emerald-800 no-underline">{show(replacement)}</ins> : null}
      <span className="text-muted">{after.replace(/\s\S*$/, "…").replace(/\n/g, " ")}</span>
    </span>
  );
}

export interface ProofHandle {
  /** Показать замечание: каретка на нём и карточка с исправлением. */
  open(issue: Issue): void;
}

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  onValue: (value: string) => void;
  issues: Issue[];
  /** Классы шрифта — общие для поля и подложки (иначе подчёркивания разойдутся с текстом). */
  textClassName: string;
  wrapperClassName?: string;
  onApply: (issue: Issue, replacement: string) => void;
  onSkip: (issue: Issue) => void;
  onAddWord: (word: string) => void;
  /** Управление карточками снаружи (строка под полем открывает замечание). */
  handle?: React.Ref<ProofHandle>;
};

/**
 * Поле ответа с проверкой «как Grammarly»: ошибки подчёркнуты прямо в тексте, по щелчку (касанию) —
 * карточка с пояснением и исправлением в одно нажатие. Подложка повторяет текст поля символ в символ.
 */
export const ProofTextarea = forwardRef<HTMLTextAreaElement, Props>(function ProofTextarea(
  { value, onValue, issues, textClassName, wrapperClassName, className, style, onApply, onSkip, onAddWord, handle, onClick, onKeyDown, ...rest },
  ref,
) {
  const t = useMessages().editor.proofread;
  const wrap = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const active = issues.find((i) => issueId(i) === activeId) ?? null;

  useImperativeHandle(ref, () => area.current as HTMLTextAreaElement, []);

  const openIssue = useCallback((i: Issue, focus = true) => {
    setActiveId(issueId(i));
    const el = area.current;
    if (el && focus) {
      el.focus({ preventScroll: true });
      el.setSelectionRange(i.end, i.end);
    }
  }, []);
  useImperativeHandle(handle, () => ({ open: (i) => openIssue(i) }), [openIssue]);

  // Карточка — под подчёркнутым словом, в пределах поля.
  useLayoutEffect(() => {
    if (!active) return;
    const w = wrap.current;
    const mark = w?.querySelector<HTMLElement>(`[data-issue="${CSS.escape(issueId(active))}"]`);
    if (!w || !mark) return;
    const wr = w.getBoundingClientRect();
    const rects = mark.getClientRects();
    const r = rects[rects.length - 1] ?? mark.getBoundingClientRect();
    const width = Math.min(340, wr.width);
    // Позиция зависит от раскладки текста — её можно узнать только после отрисовки.
    setPos({ top: r.bottom - wr.top + 8, left: Math.max(0, Math.min(r.left - wr.left - 12, wr.width - width)) });
    // Карточка должна быть видна целиком (на телефоне — над клавиатурой).
    requestAnimationFrame(() => card.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }, [active, value]);

  /** Щелчок в тексте: каретка внутри замечания — показываем его карточку. */
  const pick = () => {
    const el = area.current;
    if (!el || el.selectionStart !== el.selectionEnd) return setActiveId(null);
    const at = el.selectionStart;
    const hit = issues.find((i) => at >= i.start && at <= i.end && i.end > i.start) ?? issues.find((i) => at >= i.start - 1 && at <= i.end + 1);
    setActiveId(hit ? issueId(hit) : null);
  };

  const next = () => {
    if (!active) return;
    const after = issues.find((i) => i.start > active.start) ?? issues[0];
    if (after && issueId(after) !== issueId(active)) openIssue(after);
    else setActiveId(null);
  };

  const apply = (r: string) => {
    if (!active) return;
    const el = area.current;
    onApply(active, r);
    setActiveId(null);
    const caret = active.start + r.length;
    requestAnimationFrame(() => el?.setSelectionRange(caret, caret));
  };

  const color = active ? kindColor[active.kind] : "";
  const keep = (e: React.MouseEvent) => e.preventDefault(); // кнопки карточки не уводят фокус из поля

  return (
    <div ref={wrap} className={cn("relative", wrapperClassName)}>
      <Mirror value={value} issues={issues} activeId={activeId} className={textClassName} style={{ fontFamily: style?.fontFamily }} />
      <textarea
        {...rest}
        ref={area}
        value={value}
        spellCheck={false}
        onChange={(e) => onValue(e.target.value)}
        onClick={(e) => {
          pick();
          onClick?.(e);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setActiveId(null);
          else if (activeId && e.key.length === 1) setActiveId(null);
          onKeyDown?.(e);
        }}
        className={cn("relative block w-full overflow-hidden bg-transparent", textClassName, className)}
        style={style}
      />
      {active && pos ? (
        <div
          ref={card}
          role="dialog"
          aria-label={t.kinds[active.kind]}
          onMouseDown={keep}
          className="animate-pop absolute z-20 w-[min(340px,100%)] rounded-2xl border border-line bg-white p-3 text-left shadow-xl"
          style={{ top: pos.top, left: pos.left, borderTop: `3px solid ${color}` }}
        >
          <div className="flex items-center gap-2 text-xs font-medium" style={{ color }}>
            <span className="size-2 rounded-full" style={{ background: color }} />
            {t.kinds[active.kind]}
            {active.source === "ai" ? <span className="rounded-full bg-violet-100 px-1.5 py-px text-[10px] font-semibold text-violet-700">{t.aiBadge}</span> : null}
            <button type="button" className="ml-auto rounded-md p-1 text-muted hover:bg-cream hover:text-ink" onClick={() => setActiveId(null)} aria-label={t.close}>
              <X className="size-3.5" />
            </button>
          </div>
          <p className="mt-1 text-sm leading-snug text-ink-soft">{active.note ?? t.rules[active.rule] ?? t.rules.ai}</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {active.source === "spell" ? (
              active.replacements.length ? (
                active.replacements.map((r) => (
                  <button key={r} type="button" onClick={() => apply(r)} className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200 transition hover:bg-emerald-100">
                    {r}
                  </button>
                ))
              ) : (
                <span className="text-xs text-muted">{t.noSuggestions}</span>
              )
            ) : (
              active.replacements.slice(0, 3).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => apply(r)}
                  className="flex w-full min-w-0 items-center gap-2 rounded-xl bg-emerald-50/70 px-3 py-2 text-left text-sm ring-1 ring-emerald-200 transition hover:bg-emerald-100"
                >
                  <Check className="size-4 shrink-0 text-emerald-700" />
                  {r === "" && !value.slice(active.start, active.end).trim() ? <span className="font-medium text-emerald-800">{t.remove}</span> : <Preview text={value} issue={active} replacement={r} />}
                </button>
              ))
            )}
          </div>
          <div className="mt-2 flex items-center gap-1 border-t border-line/70 pt-2 text-xs whitespace-nowrap">
            <button type="button" onClick={() => (onSkip(active), next())} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-muted hover:bg-cream hover:text-ink">
              <EyeOff className="size-3.5" /> {t.skip}
            </button>
            {active.source === "spell" ? (
              <button type="button" onClick={() => (onAddWord(value.slice(active.start, active.end)), next())} title={t.addWordTitle} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-muted hover:bg-cream hover:text-ink">
                <BookPlus className="size-3.5" /> {t.addWord}
              </button>
            ) : null}
            {issues.length > 1 ? (
              <button type="button" onClick={next} className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1.5 text-muted hover:bg-cream hover:text-ink" aria-label={t.next} title={t.next}>
                <ArrowRight className="size-3.5" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
});

/** Строка под полем: сколько замечаний какого рода, «исправить оформление» разом и AI-корректор. */
export function ProofBar({
  issues,
  hasText,
  safeCount,
  onFixAll,
  onOpen,
  ai,
  aiState,
  onAi,
}: {
  issues: Issue[];
  hasText: boolean;
  safeCount: number;
  onFixAll: () => void;
  onOpen: (issue: Issue) => void;
  /** AI-корректор подключён. */
  ai: boolean;
  aiState: AiState;
  onAi: () => void;
}) {
  const t = useMessages().editor.proofread;
  if (!hasText) return null;
  const byKind = issueKinds.map((k) => ({ k, list: issues.filter((i) => i.kind === k) })).filter((x) => x.list.length);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2 text-xs">
      {issues.length ? (
        byKind.map(({ k, list }) => (
          <button
            key={k}
            type="button"
            onClick={() => onOpen(list[0])}
            className="flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-ink-soft transition hover:border-ink/30"
            title={t.kinds[k]}
          >
            <span className="size-2 rounded-full" style={{ background: kindColor[k] }} />
            <span className="tabular-nums">{list.length}</span> <span className="max-sm:hidden">{t.kinds[k].toLowerCase()}</span>
          </button>
        ))
      ) : (
        <span className="flex items-center gap-1.5 text-emerald-700">
          <CheckCircle2 className="size-3.5" /> {aiState === "done" ? t.aiNothing : t.clean}
        </span>
      )}
      <span className="ml-auto flex flex-wrap items-center gap-2">
        {safeCount ? (
          <button type="button" onClick={onFixAll} title={t.fixAllTitle} className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 font-medium text-amber-800 ring-1 ring-amber-200 transition hover:bg-amber-100">
            <Wand2 className="size-3.5" /> {t.fixAll(safeCount)}
          </button>
        ) : null}
        {ai ? (
          <button
            type="button"
            onClick={onAi}
            disabled={aiState === "checking"}
            title={t.aiTitle}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 font-medium ring-1 transition",
              aiState === "done" ? "bg-white text-violet-700 ring-violet-200 hover:bg-violet-50" : "bg-violet-600 text-white ring-violet-600 hover:bg-violet-700 disabled:opacity-80",
            )}
          >
            {aiState === "checking" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            {aiState === "checking" ? t.aiChecking : aiState === "done" ? t.aiAgain : t.ai}
          </button>
        ) : null}
      </span>
    </div>
  );
}
