"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { AlignLeft, ArrowUp, Expand, LoaderCircle, Minimize2, Redo2, RefreshCw, Sparkles, Undo2, WandSparkles } from "lucide-react";
import { confirmDialog, toast, toastError } from "@/components/ui/overlays";
import { useMessages } from "@/i18n/client";
import { apiFetch } from "@/lib/client-api";
import { cn } from "@/lib/class-names";

type Mode = "format" | "improve" | "expand" | "shorten" | "custom";

/** Одна правка помощника: текст до и после, и что именно просили (для «Другой вариант»). */
interface Edit {
  before: string;
  after: string;
  mode: Mode;
  prompt?: string;
  /** Выделенный фрагмент в тексте «до»; нет — правился весь ответ. */
  range?: [number, number];
}

const modeIcons = { format: AlignLeft, improve: WandSparkles, expand: Expand, shorten: Minimize2 } as const;

/**
 * AI-помощник при письме: оформить, улучшить, сделать больше или короче, переписать по своей просьбе —
 * весь ответ или выделенный фрагмент. Каждая правка отменяется («Отменить» / «Вернуть правку»), история — своя у каждого вопроса.
 */
export function AiWriter({
  bookId,
  docId,
  text,
  textarea,
  onText,
  onBusy,
}: {
  bookId: string;
  /** Вопрос, к которому относится текст: у каждого своя история правок. */
  docId: string;
  text: string;
  textarea: React.RefObject<HTMLTextAreaElement | null>;
  onText: (next: string) => void;
  /** Пока помощник пишет, поле лучше не править — иначе его ответ ляжет поверх набранного. */
  onBusy: (busy: boolean) => void;
}) {
  const t = useMessages().editor.writeAi;
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState<Mode | null>(null);
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [history, setHistory] = useState<Record<string, { undo: Edit[]; redo: Edit[] }>>({});
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const { undo = [], redo = [] } = history[docId] ?? {};
  const last = undo.at(-1);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (!box.current?.contains(target) && !panel.current?.contains(target)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  // Окно — поверх страницы (карточка ответа обрезает всё, что выходит за её края): под кнопкой, а если внизу тесно —
  // над ней; на телефоне — снизу экрана. Положение следует за кнопкой при прокрутке.
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const r = button.current?.getBoundingClientRect();
      if (!r) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (vw < 640) return setPlace({ left: 12, right: 12, bottom: 12 });
      const width = Math.min(360, vw - 24);
      const left = Math.max(12, Math.min(r.right - width, vw - width - 12));
      const below = vh - r.bottom;
      const height = panel.current?.offsetHeight ?? 320;
      setPlace(below < height + 16 && r.top > below ? { left, width, bottom: vh - r.top + 8 } : { left, width, top: r.bottom + 8 });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  const setDoc = (fn: (h: { undo: Edit[]; redo: Edit[] }) => { undo: Edit[]; redo: Edit[] }) =>
    setHistory((all) => ({ ...all, [docId]: fn(all[docId] ?? { undo: [], redo: [] }) }));

  /** Выделение в поле ответа — запоминаем при открытии: фокус потом уйдёт в поле просьбы. */
  const toggle = () => {
    const el = textarea.current;
    setSel(el && el.selectionEnd > el.selectionStart && el.value === text ? [el.selectionStart, el.selectionEnd] : null);
    setOpen((v) => !v);
  };

  async function run(mode: Mode, base: string, range: [number, number] | undefined, instruction?: string, replaceLast = false) {
    const fragment = range ? base.slice(range[0], range[1]) : base;
    if (!fragment.trim() || busy) return;
    setBusy(mode);
    onBusy(true);
    try {
      const res = await apiFetch<{ text: string }>(`/api/books/${bookId}/write/ai`, { method: "POST", json: { text: fragment, mode, prompt: instruction } });
      // Выделение заменяем, сохраняя пробелы вокруг него, — иначе фрагмент «слипнется» с соседним текстом.
      const lead = fragment.match(/^\s*/)![0];
      const tail = fragment.match(/\s*$/)![0];
      const piece = range ? lead + res.text.trim() + tail : res.text;
      const after = range ? base.slice(0, range[0]) + piece + base.slice(range[1]) : piece;
      if (after === base) {
        toast(t.unchanged, "info");
        return;
      }
      const edit: Edit = { before: base, after, mode, prompt: instruction, range };
      onText(after);
      setDoc((h) => ({ undo: [...(replaceLast ? h.undo.slice(0, -1) : h.undo), edit].slice(-20), redo: [] }));
      setOpen(false);
      setPrompt("");
      if (range) requestAnimationFrame(() => textarea.current?.setSelectionRange(range[0], range[0] + piece.length));
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
      onBusy(false);
    }
  }

  const undoLast = async () => {
    if (!last) return;
    if (text !== last.after && !(await confirmDialog({ title: t.undo, text: t.undoEdited, confirmLabel: t.undo }))) return;
    onText(last.before);
    setDoc((h) => ({ undo: h.undo.slice(0, -1), redo: [...h.redo, last] }));
    toast(t.undone, "info");
  };

  const redoLast = () => {
    const edit = redo.at(-1);
    if (!edit || text !== edit.before) return;
    onText(edit.after);
    setDoc((h) => ({ undo: [...h.undo, edit], redo: h.redo.slice(0, -1) }));
  };

  /** Другой вариант той же просьбы — из того же исходного текста, прошлая правка заменяется новой. */
  const again = () => {
    if (!last || text !== last.after) return;
    void run(last.mode, last.before, last.range, last.prompt, true);
  };

  const canRedo = !!redo.length && text === redo.at(-1)!.before;
  const fresh = !!last && text === last.after;
  const keep = (e: React.MouseEvent) => e.preventDefault(); // кнопки не уводят фокус и выделение из поля

  return (
    <div ref={box} className="relative flex flex-wrap items-center gap-2">
      {fresh ? (
        <span className="animate-pop flex items-center gap-1 rounded-full bg-violet-50 py-0.5 pr-1 pl-2.5 text-violet-800 ring-1 ring-violet-200">
          <Sparkles className="size-3.5 shrink-0" />
          <span className="max-sm:hidden">{t.applied}</span>
          <button type="button" onMouseDown={keep} onClick={() => void undoLast()} disabled={!!busy} className="flex items-center gap-1 rounded-full px-2 py-0.5 font-medium hover:bg-violet-100">
            <Undo2 className="size-3.5" /> {t.undo}
          </button>
          <button type="button" onMouseDown={keep} onClick={again} disabled={!!busy} title={t.again} aria-label={t.again} className="rounded-full p-1 hover:bg-violet-100 disabled:opacity-60">
            {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          </button>
        </span>
      ) : last && !canRedo ? (
        <button type="button" onMouseDown={keep} onClick={() => void undoLast()} disabled={!!busy} className="flex items-center gap-1 rounded-full px-2 py-1 text-muted hover:bg-cream hover:text-ink">
          <Undo2 className="size-3.5" /> {t.undo}
        </button>
      ) : null}
      {canRedo ? (
        <button type="button" onMouseDown={keep} onClick={redoLast} className="flex items-center gap-1 rounded-full px-2 py-1 text-muted hover:bg-cream hover:text-ink">
          <Redo2 className="size-3.5" /> {t.redo}
        </button>
      ) : null}
      <button
        ref={button}
        type="button"
        onMouseDown={keep}
        onClick={toggle}
        disabled={!!busy}
        title={t.openTitle}
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1.5 rounded-full px-3 py-1 font-medium ring-1 transition",
          open ? "bg-violet-100 text-violet-800 ring-violet-300" : "bg-white text-violet-700 ring-violet-200 hover:bg-violet-50",
        )}
      >
        {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <WandSparkles className="size-3.5" />}
        {busy ? t.working : t.open}
      </button>

      {open
        ? createPortal(
            <div
              ref={panel}
              role="dialog"
              aria-label={t.open}
              className="animate-pop fixed z-50 rounded-2xl border border-line bg-white p-2 text-left text-xs shadow-xl"
              style={place ?? { visibility: "hidden", top: 0, left: 0 }}
            >
              <p className="px-2 pt-1 pb-2 text-[11px] font-medium tracking-wide text-muted uppercase">{sel ? t.selection : t.whole}</p>
              <div className="grid grid-cols-2 gap-1">
                {(Object.keys(modeIcons) as (keyof typeof modeIcons)[]).map((m) => {
                  const Icon = modeIcons[m];
                  return (
                    <button
                      key={m}
                      type="button"
                      disabled={!!busy}
                      onClick={() => void run(m, text, sel ?? undefined)}
                      className="flex items-start gap-2 rounded-xl px-2.5 py-2 text-left transition hover:bg-violet-50 disabled:opacity-60"
                    >
                      {busy === m ? <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin text-violet-600" /> : <Icon className="mt-0.5 size-4 shrink-0 text-violet-600" />}
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-ink">{t.modes[m].label}</span>
                        <span className="block text-xs leading-snug text-muted">{t.modes[m].hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <form
                className="mt-2 flex items-end gap-1.5 border-t border-line/70 pt-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (prompt.trim()) void run("custom", text, sel ?? undefined, prompt.trim());
                }}
              >
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                  rows={2}
                  maxLength={500}
                  placeholder={t.promptPlaceholder}
                  className="min-w-0 flex-1 resize-none rounded-xl bg-cream/60 px-3 py-2 text-sm outline-none placeholder:text-muted/70 focus:ring-2 focus:ring-violet-200"
                />
                <button
                  type="submit"
                  disabled={!prompt.trim() || !!busy}
                  aria-label={t.send}
                  title={t.send}
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-violet-600 text-white transition hover:bg-violet-700 disabled:opacity-40"
                >
                  {busy === "custom" ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
                </button>
              </form>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
