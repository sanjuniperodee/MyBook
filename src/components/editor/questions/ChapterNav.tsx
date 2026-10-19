"use client";

import { memo, useDeferredValue, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Check, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { confirmDialog } from "@/components/ui/overlays";
import { useMessages } from "@/i18n/client";
import { sectionLabel, type ChapterGroup, type EditorPhoto } from "@/lib/book/editor-model";
import { CHAPTER_TITLE_MAX, type BookKind } from "@/lib/content/kinds";
import { cn } from "@/lib/class-names";
import { chapterNumbers, chapterStats } from "./outline";

/** Что оглавление может делать с главами и разделами своей книги; null у ChapterNav — оглавление только для чтения. */
export interface NavActions {
  rename(key: string, title: string): void;
  addChapter(title: string): void;
  deleteChapter(key: string): void;
  moveChapter(key: string, delta: -1 | 1): void;
  addSection(chapterKey: string): void;
  deleteSection(id: string): void;
  moveSection(id: string, delta: -1 | 1): void;
  moveSectionToChapter(id: string, chapterKey: string): void;
}

interface NavProps {
  groups: ChapterGroup[];
  kind: BookKind;
  current: string | null;
  onPick: (id: string) => void;
  photos: EditorPhoto[];
  actions: NavActions | null;
  /** Идёт операция оглавления: кнопки заблокированы, пока сервер не ответил. */
  busy: boolean;
  /** Глава, название которой правится в строке (её открывает и кнопка в шапке листа). */
  renaming: string | null;
  onRenaming: (key: string | null) => void;
}

/** Кнопка-значок действия: на телефоне не меньше 40 px. */
function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg transition hover:bg-ink/5 disabled:opacity-35 max-sm:size-10 max-sm:border max-sm:border-line",
        danger ? "text-red-700" : "text-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

/** Название главы в строке: Enter и уход из поля сохраняют, Escape отменяет и не закрывает панель оглавления. */
function RenameField({ initial, onDone }: { initial: string; onDone: (title: string | null) => void }) {
  const t = useMessages().editor.nav;
  const cancelled = useRef(false);
  const done = useRef(false);
  const finish = (value: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(value);
  };
  return (
    <input
      autoFocus
      defaultValue={initial}
      maxLength={CHAPTER_TITLE_MAX}
      aria-label={t.chapterTitleAria}
      placeholder={t.chapterTitle}
      className="input h-10 min-w-0 flex-1 text-sm"
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      onBlur={(e) => finish(cancelled.current ? null : e.currentTarget.value.trim())}
    />
  );
}

/** «+ Новая глава»: кнопка раскрывается в поле названия; Enter создаёт, Escape отменяет. */
function AddChapter({ onAdd, busy }: { onAdd: (title: string) => void; busy: boolean }) {
  const t = useMessages().editor.nav;
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" disabled={busy} onClick={() => setOpen(true)} className="btn btn-outline mt-4 h-10 w-full justify-center text-sm">
        <Plus className="size-4" /> {t.newChapter}
      </button>
    );
  return (
    <form
      className="mt-4 flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const title = new FormData(e.currentTarget).get("title");
        onAdd(typeof title === "string" ? title.trim() : "");
        setOpen(false);
      }}
    >
      <input
        name="title"
        autoFocus
        maxLength={CHAPTER_TITLE_MAX}
        aria-label={t.chapterTitleAria}
        placeholder={t.chapterTitle}
        className="input h-10 min-w-0 flex-1 text-sm"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      <button className="btn btn-primary h-10 shrink-0 text-sm" disabled={busy}>
        {t.add}
      </button>
    </form>
  );
}

/**
 * Оглавление по главам: поиск, «только без текста», текущая глава раскрыта. У своей книги (actions не null) главы
 * переименовываются в строке, переставляются и удаляются, разделы переставляются, переносятся в другую главу и удаляются.
 */
function ChapterNavView({ groups, kind, current, onPick, photos, actions, busy, renaming, onRenaming }: NavProps) {
  const ed = useMessages();
  const t = ed.editor;
  const nav = t.nav;
  const blank = kind === "blank";
  const untitled = ed.books.untitledSection;
  const untitledChapter = ed.book.untitledChapter;
  const currentKey = groups.find((g) => g.items.some((x) => x.q.id === current))?.key;
  const [open, setOpen] = useState<string | undefined>(currentKey);
  const [menu, setMenu] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const numbers = chapterNumbers(groups, photos, blank);

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
  const own = blank && actions !== null;

  const askDelete = async (g: ChapterGroup) => {
    const st = chapterStats(
      g.items.map((x) => x.q),
      photos,
      g.key,
    );
    const ok = await confirmDialog({ title: nav.deleteChapterTitle, text: nav.deleteChapterText(st.sections, st.words, st.photos), confirmLabel: t.delete, danger: true });
    if (ok) actions?.deleteChapter(g.key);
  };

  return (
    <div ref={list}>
      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <input className="input h-10 pl-9 text-sm" placeholder={blank ? t.blank.search : t.search} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <label className="mt-3 flex items-center gap-2 px-1 text-xs text-muted">
        <input type="checkbox" className="accent-wine" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} />
        {blank ? t.blank.onlyEmpty : t.onlyEmpty}
      </label>
      <ol className="mt-4 space-y-1">
        {groups.map((g, gi) => {
          const answered = g.items.filter((x) => x.q.answer.trim()).length;
          const items = g.items.filter(({ q }) => {
            if (onlyEmpty && q.answer.trim()) return false;
            return !s || sectionLabel(q, kind, untitled).toLowerCase().includes(s) || q.prompt.toLowerCase().includes(s) || q.answer.toLowerCase().includes(s);
          });
          if (filtering && !items.length) return null;
          // Пустая глава всегда раскрыта: в ней только подсказка «Пока нет разделов · Добавить раздел».
          const expanded = filtering || open === g.key || (blank && !g.items.length);
          const number = numbers.get(g.key) ?? null;
          const empty = blank && number === null;
          const title = g.title.trim() || (blank ? untitledChapter : g.title);
          const menuOpen = own && menu === g.key;
          return (
            <li key={`${g.key}-${gi}`}>
              <div className="flex items-center gap-1">
                {renaming === g.key && own ? (
                  <RenameField
                    initial={g.title}
                    onDone={(value) => {
                      onRenaming(null);
                      if (value !== null && value !== g.title) actions?.rename(g.key, value);
                    }}
                  />
                ) : (
                  <button
                    onClick={() => setOpen(expanded && !filtering ? undefined : g.key)}
                    className={cn("flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-2 text-left text-sm transition hover:bg-ink/5", g.key === currentKey && "font-medium")}
                  >
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px]",
                        empty ? "bg-cream text-muted" : answered === g.items.length && g.items.length ? "bg-wine text-white" : answered ? "bg-rose text-wine" : "bg-cream text-muted",
                      )}
                    >
                      {empty ? "–" : answered === g.items.length && g.items.length ? <Check className="size-3" /> : (number ?? gi + 1)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate", !g.title.trim() && blank && "text-muted italic")}>{title}</span>
                      {empty ? <span className="block truncate text-[11px] font-normal text-muted">{nav.notInBook}</span> : null}
                    </span>
                    <span className="text-[11px] text-muted tabular-nums">
                      {answered}/{g.items.length}
                    </span>
                  </button>
                )}
                {own && renaming !== g.key ? (
                  <IconBtn label={nav.chapterActions(title)} onClick={() => setMenu(menuOpen ? null : g.key)}>
                    <MoreHorizontal className="size-4" />
                  </IconBtn>
                ) : null}
              </div>
              {menuOpen ? (
                <div className="mt-1 mb-2 ml-2 flex flex-wrap items-center gap-1">
                  <IconBtn
                    label={nav.rename}
                    disabled={busy}
                    onClick={() => {
                      setMenu(null);
                      onRenaming(g.key);
                    }}
                  >
                    <Pencil className="size-4" />
                  </IconBtn>
                  <IconBtn label={nav.up} disabled={busy || gi === 0} onClick={() => actions?.moveChapter(g.key, -1)}>
                    <ArrowUp className="size-4" />
                  </IconBtn>
                  <IconBtn label={nav.down} disabled={busy || gi === groups.length - 1} onClick={() => actions?.moveChapter(g.key, 1)}>
                    <ArrowDown className="size-4" />
                  </IconBtn>
                  <IconBtn
                    label={nav.deleteChapter}
                    danger
                    disabled={busy}
                    onClick={() => {
                      setMenu(null);
                      void askDelete(g);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </IconBtn>
                </div>
              ) : null}
              {expanded ? (
                <ol className="mt-0.5 mb-2 ml-5 border-l border-line pl-2">
                  {!g.items.length ? (
                    <li className="px-2 py-1.5 text-[13px] leading-snug text-muted">
                      {nav.emptyChapter}
                      {own ? (
                        <>
                          {" · "}
                          <button type="button" disabled={busy} className="text-wine hover:underline disabled:opacity-50 max-sm:py-2" onClick={() => actions?.addSection(g.key)}>
                            {nav.addSectionHere}
                          </button>
                        </>
                      ) : null}
                    </li>
                  ) : null}
                  {items.map(({ q }, k) => {
                    const here = q.id === current;
                    return (
                      <li key={q.id}>
                        <button
                          data-current={here}
                          onClick={() => onPick(q.id)}
                          className={cn("flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] leading-snug transition max-sm:py-2.5", here ? "bg-wine/8 text-wine" : "text-ink-soft hover:bg-ink/5")}
                        >
                          <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", q.answer.trim() ? "bg-emerald-500" : "bg-line")} />
                          <span className="line-clamp-2">{sectionLabel(q, kind, untitled)}</span>
                        </button>
                        {own && here && !filtering ? (
                          <div className="my-1 flex flex-wrap items-center gap-1 pl-4">
                            <IconBtn label={nav.up} disabled={busy || k === 0} onClick={() => actions?.moveSection(q.id, -1)}>
                              <ArrowUp className="size-4" />
                            </IconBtn>
                            <IconBtn label={nav.down} disabled={busy || k === items.length - 1} onClick={() => actions?.moveSection(q.id, 1)}>
                              <ArrowDown className="size-4" />
                            </IconBtn>
                            {groups.length > 1 ? (
                              <select
                                aria-label={nav.moveTo}
                                value=""
                                disabled={busy}
                                className="input h-8 w-auto min-w-0 flex-1 py-0 text-xs max-sm:h-10"
                                onChange={(e) => e.target.value && actions?.moveSectionToChapter(q.id, e.target.value)}
                              >
                                <option value="">{nav.moveTo}</option>
                                {groups
                                  .filter((x) => x.key !== g.key)
                                  .map((x) => (
                                    <option key={x.key} value={x.key}>
                                      {x.title.trim() || untitledChapter}
                                    </option>
                                  ))}
                              </select>
                            ) : null}
                            <IconBtn label={nav.deleteSection} danger disabled={busy} onClick={() => actions?.deleteSection(q.id)}>
                              <Trash2 className="size-4" />
                            </IconBtn>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                  {own && g.items.length && !filtering ? (
                    <li>
                      <button type="button" disabled={busy} onClick={() => actions?.addSection(g.key)} className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[13px] text-wine hover:bg-ink/5 disabled:opacity-50 max-sm:py-2.5">
                        <Plus className="size-3.5" /> {nav.addSection}
                      </button>
                    </li>
                  ) : null}
                </ol>
              ) : null}
            </li>
          );
        })}
      </ol>
      {own ? <AddChapter onAdd={(title) => actions?.addChapter(title)} busy={busy} /> : null}
    </div>
  );
}

const ChapterNavList = memo(ChapterNavView);

/**
 * Оглавление получает главы отложенно (useDeferredValue): отметки «есть ответ» догоняют ввод, а сам список
 * перерисовывается, только когда меняются главы или текущий вопрос. Текущий вопрос и переход — по id, а не по
 * месту в списке: пока отложенные главы догоняют добавленный или удалённый вопрос, места сдвинуты.
 */
export function ChapterNav({ groups, ...rest }: NavProps) {
  const deferred = useDeferredValue(groups);
  return <ChapterNavList groups={deferred} {...rest} />;
}
