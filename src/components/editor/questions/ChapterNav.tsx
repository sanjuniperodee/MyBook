"use client";

import { memo, useDeferredValue, useEffect, useRef, useState } from "react";
import { Check, Search } from "lucide-react";
import { useMessages } from "@/i18n/client";
import type { ChapterGroup } from "@/lib/book/editor-model";
import { cn } from "@/lib/class-names";

/** Оглавление вопросов по главам: поиск, «только без ответа», текущая глава раскрыта. */
function ChapterNavView({ groups, current, onPick }: { groups: ChapterGroup[]; current: number; onPick: (i: number) => void }) {
  const t = useMessages().editor;
  const currentKey = groups.find((g) => g.items.some((x) => x.i === current))?.key;
  const [open, setOpen] = useState<string | undefined>(currentKey);
  const [search, setSearch] = useState("");
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // раскрываем главу текущего вопроса при переходе
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(currentKey);
  }, [currentKey]);

  useEffect(() => {
    list.current?.querySelector("[data-current=true]")?.scrollIntoView({ block: "nearest" });
  }, [current, open]);

  const s = search.trim().toLowerCase();
  const filtering = !!s || onlyEmpty;

  return (
    <div ref={list}>
      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <input className="input h-10 pl-9 text-sm" placeholder={t.search} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <label className="mt-3 flex items-center gap-2 px-1 text-xs text-muted">
        <input type="checkbox" className="accent-wine" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} />
        {t.onlyEmpty}
      </label>
      <ol className="mt-4 space-y-1">
        {groups.map((g, gi) => {
          const answered = g.items.filter((x) => x.q.answer.trim()).length;
          const items = g.items.filter(
            ({ q }) => (!onlyEmpty || !q.answer.trim()) && (!s || q.prompt.toLowerCase().includes(s) || q.answer.toLowerCase().includes(s)),
          );
          if (filtering && !items.length) return null;
          const expanded = filtering || open === g.key;
          return (
            <li key={`${g.key}-${gi}`}>
              <button
                onClick={() => setOpen(expanded && !filtering ? undefined : g.key)}
                className={cn("flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm transition hover:bg-ink/5", g.key === currentKey && "font-medium")}
              >
                <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-[11px]", answered === g.items.length ? "bg-wine text-white" : answered ? "bg-rose text-wine" : "bg-cream text-muted")}>
                  {answered === g.items.length ? <Check className="size-3" /> : gi + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{g.title}</span>
                <span className="text-[11px] text-muted tabular-nums">
                  {answered}/{g.items.length}
                </span>
              </button>
              {expanded ? (
                <ol className="mt-0.5 mb-2 ml-5 border-l border-line pl-2">
                  {items.map(({ q, i }) => (
                    <li key={q.id}>
                      <button
                        data-current={i === current}
                        onClick={() => onPick(i)}
                        className={cn("flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] leading-snug transition", i === current ? "bg-wine/8 text-wine" : "text-ink-soft hover:bg-ink/5")}
                      >
                        <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", q.answer.trim() ? "bg-emerald-500" : "bg-line")} />
                        <span className="line-clamp-2">{q.prompt}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const ChapterNavList = memo(ChapterNavView);

/**
 * Оглавление получает главы отложенно (useDeferredValue): отметки «есть ответ» догоняют ввод, а сам список
 * перерисовывается, только когда меняются главы или текущий вопрос.
 */
export function ChapterNav({ groups, ...rest }: { groups: ChapterGroup[]; current: number; onPick: (i: number) => void }) {
  const deferred = useDeferredValue(groups);
  return <ChapterNavList groups={deferred} {...rest} />;
}
