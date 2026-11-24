"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Bookmark, CalendarDays, CheckCheck, ChevronDown, Columns3, GanttChart, Keyboard, List, LoaderCircle, Rows3, Search, Settings2, SquareCheck, Trash2, X } from "lucide-react";
import { matchesFilter, type CardFilter } from "@/modules/boards/domain";
import { confirmDialog, promptText, toast, toastError } from "@/components/ui/overlays";
import { cn } from "@/lib/class-names";
import { priorityLabels, type TaskPriority } from "@/shared/domain/boards";
import { BoardSettings } from "./BoardSettings";
import { CalendarView } from "./CalendarView";
import { CardDialog } from "./CardDialog";
import { boardsApi, onBoardEvent, type BoardSummary, type BoardView, type CardSummary, type Staff } from "./client";
import { Kanban, type Lane } from "./Kanban";
import { ListView } from "./ListView";
import { TimelineView } from "./TimelineView";
import { LabelChip, Popover, staffMap, typingTarget } from "./ui";

export type ViewKind = "board" | "list" | "calendar" | "timeline";
const VIEWS: { key: ViewKind; label: string; icon: typeof Columns3 }[] = [
  { key: "board", label: "Доска", icon: Columns3 },
  { key: "list", label: "Список", icon: List },
  { key: "calendar", label: "Календарь", icon: CalendarDays },
  { key: "timeline", label: "Шкала", icon: GanttChart },
];

/** Фильтр ↔ строка адреса (сохраняемые виды хранят её же). */
function filterQuery(f: CardFilter, view: ViewKind, lanes: string) {
  const q = new URLSearchParams();
  if (view !== "board") q.set("view", view);
  if (f.q) q.set("q", f.q);
  if (f.who) q.set("who", f.who);
  if (f.labels?.length) q.set("label", f.labels.join(","));
  if (f.priority?.length) q.set("priority", f.priority.join(","));
  if (f.due) q.set("due", f.due);
  if (f.done) q.set("done", "1");
  if (lanes !== "none") q.set("lanes", lanes);
  return q.toString();
}

function parseQuery(query: string): { filter: CardFilter; view: ViewKind; lanes: string } {
  const sp = new URLSearchParams(query);
  const many = (k: string) => (sp.get(k) ?? "").split(",").filter(Boolean);
  const view = sp.get("view");
  return {
    filter: { q: sp.get("q") ?? undefined, who: sp.get("who") ?? undefined, labels: many("label"), priority: many("priority"), due: (sp.get("due") as CardFilter["due"]) ?? undefined, done: sp.get("done") === "1" || undefined },
    view: view === "list" || view === "calendar" || view === "timeline" ? view : "board",
    lanes: sp.get("lanes") ?? "none",
  };
}

/**
 * Доска задач целиком: виды (доска, список, календарь, шкала), фильтры и сохранённые фильтры, поиск, дорожки, массовые
 * действия, быстрые клавиши (n — новая карточка, / — поиск, e — открыть, пробел — взять себе, c — в архив, Esc),
 * живое обновление у всех и откат при ошибке.
 */
export function BoardApp({ initial, boards, staff, me, initialQuery, initialCard }: { initial: BoardView; boards: BoardSummary[]; staff: Staff[]; me: string; initialQuery: string; initialCard: string | null }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const start = parseQuery(initialQuery);
  const [filter, setFilter] = useState<CardFilter>(start.filter);
  const [view, setView] = useState<ViewKind>(start.view);
  const [lanes, setLanes] = useState(start.lanes);
  const [openCard, setOpenCard] = useState<string | null>(initialCard);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [wideLabels, setWideLabels] = useState(false);
  const [addingIn, setAddingIn] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [help, setHelp] = useState(false);
  const [loading, setLoading] = useState(false);
  const hovered = useRef<string | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const pending = useRef(0);
  const dirty = useRef(false);
  const board = data.board;
  const names = useMemo(() => staffMap(staff), [staff]);
  const labels = useMemo(() => new Map(data.labels.map((l) => [l.id, l])), [data.labels]);

  // ─── Загрузка и живое обновление ───
  const reload = useCallback(async () => {
    if (pending.current > 0) {
      dirty.current = true;
      return;
    }
    try {
      setLoading(true);
      setData(await boardsApi.board(board.id, { done: !!filter.done }));
    } catch {
      // сеть моргнула — следующее событие или фокус повторит
    } finally {
      setLoading(false);
    }
  }, [board.id, filter.done]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soon = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void reload(), 350);
  }, [reload]);

  useEffect(() => {
    const ids = new Set(data.cards.map((c) => c.id));
    return onBoardEvent((e) => {
      if (!e.boardId || e.boardId === board.id || (board.isDefault && !e.boardId) || (e.taskId && ids.has(e.taskId))) soon();
    });
  }, [board.id, board.isDefault, data.cards, soon]);

  useEffect(() => {
    const onFocus = () => document.visibilityState === "visible" && soon();
    document.addEventListener("visibilitychange", onFocus);
    const poll = setInterval(onFocus, 90_000);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      clearInterval(poll);
    };
  }, [soon]);

  const firstDone = useRef(true);
  useEffect(() => {
    if (firstDone.current) {
      firstDone.current = false;
      return;
    }
    void reload();
  }, [filter.done, reload]);

  // Адрес страницы — вид, фильтр и открытая карточка: ссылку можно отправить коллеге.
  useEffect(() => {
    const q = new URLSearchParams(filterQuery(filter, view, lanes));
    if (openCard) q.set("card", openCard);
    const url = `${window.location.pathname}${q.size ? `?${q}` : ""}`;
    window.history.replaceState(window.history.state, "", url);
  }, [filter, view, lanes, openCard]);

  /** Изменение с мгновенным откликом: сразу на экране, затем сервер; ошибка — откат и сообщение. */
  const optimistic = async (change: (cards: CardSummary[]) => CardSummary[], call: () => Promise<unknown>) => {
    const before = data.cards;
    setData((d) => ({ ...d, cards: change(d.cards) }));
    pending.current++;
    try {
      await call();
    } catch (e) {
      setData((d) => ({ ...d, cards: before }));
      toastError(e);
    } finally {
      pending.current--;
      if (pending.current === 0 && dirty.current) {
        dirty.current = false;
        soon();
      }
    }
  };

  // ─── Фильтр ───
  const now = new Date();
  const visible = data.cards.filter((c) => matchesFilter(c, filter, me, now));
  const filtered = !!(filter.q || filter.who || filter.labels?.length || filter.priority?.length || filter.due);
  const setF = (patch: Partial<CardFilter>) => setFilter((f) => ({ ...f, ...patch }));

  // ─── Дорожки ───
  const laneList: Lane[] | null = useMemo(() => {
    if (lanes === "assignee") {
      const ids = [...new Set(visible.map((c) => c.assigneeIds[0] ?? "none"))];
      return ids.map((id) => ({ key: id, title: id === "none" ? "Без исполнителя" : (names.get(id) ?? "Сотрудник") })).sort((a, b) => (a.key === me ? -1 : b.key === me ? 1 : a.key === "none" ? 1 : b.key === "none" ? -1 : a.title.localeCompare(b.title, "ru")));
    }
    if (lanes === "label") return [...data.labels.filter((l) => visible.some((c) => c.labelIds[0] === l.id)).map((l) => ({ key: l.id, title: l.name })), ...(visible.some((c) => !c.labelIds.length) ? [{ key: "none", title: "Без метки" }] : [])];
    if (lanes === "priority") return (["urgent", "high", "normal", "low", "none"] as const).filter((p) => visible.some((c) => (c.priority ?? "none") === p)).map((p) => ({ key: p, title: p === "none" ? "Без приоритета" : priorityLabels[p] }));
    return null;
  }, [lanes, visible, data.labels, names, me]);
  const laneOf = (c: CardSummary) => (lanes === "assignee" ? (c.assigneeIds[0] ?? "none") : lanes === "label" ? (c.labelIds[0] ?? "none") : lanes === "priority" ? (c.priority ?? "none") : "all");

  // ─── Действия ───
  const moveCard = (id: string, to: { columnId: string; lane: string | null; beforeId: string | null; afterId: string | null }) => {
    const col = data.columns.find((c) => c.id === to.columnId);
    const card = data.cards.find((c) => c.id === id);
    if (!card || !col) return;
    const pos = (x: string | null) => data.cards.find((c) => c.id === x)?.position ?? null;
    const b = pos(to.beforeId);
    const a = pos(to.afterId);
    const position = b != null && a != null ? (a + b) / 2 : b != null ? b + 1024 : a != null ? a - 1024 : 1024;
    const wasDone = !!card.doneAt;
    const reassign = lanes === "assignee" && to.lane && to.lane !== (card.assigneeIds[0] ?? "none");
    if (col.wipLimit != null && col.id !== card.columnId && data.cards.filter((c) => c.columnId === col.id).length >= col.wipLimit) toast(`В «${col.name}» больше карточек, чем лимит (${col.wipLimit})`, "info");
    void optimistic(
      (cards) => cards.map((c) => (c.id === id ? { ...c, columnId: col.id, position, doneAt: col.done ? (c.doneAt ?? new Date().toISOString()) : null, ...(reassign ? { assigneeIds: to.lane === "none" ? [] : [to.lane!, ...c.assigneeIds.filter((x) => x !== to.lane).slice(1)] } : {}) } : c)),
      async () => {
        await boardsApi.move(id, { columnId: col.id, beforeId: to.beforeId, afterId: to.afterId });
        if (reassign) await boardsApi.assignees(id, to.lane === "none" ? [] : [to.lane!, ...card.assigneeIds.filter((x) => x !== to.lane).slice(1)]);
        if (col.done && !wasDone) toast("Выполнено", "success", { action: { label: "Вернуть", run: () => void boardsApi.move(id, { columnId: card.columnId! }).then(soon, toastError) } });
      },
    );
  };

  const moveColumn = async (id: string, beforeId: string | null, afterId: string | null) => {
    const cols = [...data.columns];
    const from = cols.findIndex((c) => c.id === id);
    const [moved] = cols.splice(from, 1);
    const at = beforeId ? cols.findIndex((c) => c.id === beforeId) + 1 : 0;
    cols.splice(at, 0, moved);
    setData((d) => ({ ...d, columns: cols }));
    try {
      await boardsApi.updateColumn(id, { beforeId, afterId });
    } catch (e) {
      toastError(e);
    }
    soon();
  };

  const quickAdd = async (columnId: string, title: string, lane: string | null) => {
    try {
      const assignees = lanes === "assignee" && lane && lane !== "none" ? [lane] : filter.who === "me" ? [me] : [];
      const labelIds = lanes === "label" && lane && lane !== "none" ? [lane] : [];
      const top = addingIn?.startsWith("top:");
      const { card } = await boardsApi.createCard({ boardId: board.id, columnId, title, assigneeIds: assignees, labelIds, priority: lanes === "priority" && lane && lane !== "none" ? (lane as TaskPriority) : null, at: top ? "top" : "bottom" });
      setData((d) => ({ ...d, cards: [...d.cards.filter((c) => c.id !== card.id), card] }));
    } catch (e) {
      toastError(e);
      throw e;
    }
  };

  const columnMenu = async (col: BoardView["columns"][number], action: "rename" | "wip" | "done" | "delete" | "top") => {
    try {
      if (action === "top") return setAddingIn(col.id);
      if (action === "rename") {
        const name = await promptText({ title: "Название колонки", input: { initial: col.name, maxLength: 60, required: true }, confirmLabel: "Сохранить" });
        if (name?.trim()) await boardsApi.updateColumn(col.id, { name });
      }
      if (action === "wip") {
        const v = await promptText({ title: "Лимит карточек в работе", text: "Сколько карточек может быть в колонке одновременно. Больше — колонка подсветится. Пусто — без лимита.", input: { initial: col.wipLimit ? String(col.wipLimit) : "", suggestions: ["3", "5", "8", "10"], maxLength: 3 }, confirmLabel: "Сохранить" });
        if (v !== null) await boardsApi.updateColumn(col.id, { wipLimit: v.trim() ? Number(v) || null : null });
      }
      if (action === "done") await boardsApi.updateColumn(col.id, { done: !col.done });
      if (action === "delete") {
        const n = data.cards.filter((c) => c.columnId === col.id).length;
        if (!(await confirmDialog({ title: `Удалить колонку «${col.name}»?`, text: n ? `Карточки (${n}) перейдут в соседнюю колонку.` : undefined, confirmLabel: "Удалить", danger: true }))) return;
        await boardsApi.deleteColumn(col.id);
      }
      soon();
    } catch (e) {
      toastError(e);
    }
  };

  const addColumn = async () => {
    const name = await promptText({ title: "Новая колонка", input: { placeholder: "Например, «На проверке»", maxLength: 60, required: true }, confirmLabel: "Добавить" });
    if (!name?.trim()) return;
    try {
      await boardsApi.addColumn(board.id, { name, afterId: data.columns.filter((c) => !c.done).at(-1)?.id ?? null });
      soon();
    } catch (e) {
      toastError(e);
    }
  };

  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const runBulk = async (action: Parameters<typeof boardsApi.bulk>[1], done: string) => {
    const ids = [...selected];
    try {
      const r = await boardsApi.bulk(ids, action);
      toast(r.failed ? `${done}: ${r.done}, не получилось: ${r.failed} (нет прав)` : `${done}: ${r.done}`, r.failed ? "info" : "success");
      setSelected(new Set());
      setSelecting(false);
      soon();
    } catch (e) {
      toastError(e);
    }
  };

  // ─── Быстрые клавиши ───
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typingTarget(e.target) || openCard || settings) return;
      const h = hovered.current;
      const card = h ? data.cards.find((c) => c.id === h) : null;
      if (e.key === "/") {
        e.preventDefault();
        search.current?.focus();
      } else if (e.key === "n" || e.key === "т") {
        e.preventDefault();
        setView("board");
        setAddingIn(card?.columnId ?? data.columns.find((c) => !c.done)?.id ?? null);
      } else if ((e.key === "e" || e.key === "у" || e.key === "Enter") && card) {
        e.preventDefault();
        setOpenCard(card.id);
      } else if (e.key === " " && card?.editable) {
        e.preventDefault();
        const on = card.assigneeIds.includes(me);
        const ids = on ? card.assigneeIds.filter((x) => x !== me) : [...card.assigneeIds, me];
        void optimistic((cs) => cs.map((c) => (c.id === card.id ? { ...c, assigneeIds: ids } : c)), () => boardsApi.assignees(card.id, ids));
      } else if ((e.key === "c" || e.key === "с") && card?.editable) {
        e.preventDefault();
        void optimistic(
          (cs) => cs.filter((c) => c.id !== card.id),
          async () => {
            await boardsApi.archive(card.id, true);
            toast("Карточка в архиве", "success", { action: { label: "Вернуть", run: () => void boardsApi.archive(card.id, false).then(soon, toastError) } });
          },
        );
      } else if (e.key === "Escape") {
        setSelected(new Set());
        setSelecting(false);
        setAddingIn(null);
      } else if (e.key === "?") setHelp((v) => !v);
      else if (e.key === "q" || e.key === "й") setF({ who: filter.who === "me" ? undefined : "me" });
      else if (e.key === "1" || e.key === "2" || e.key === "3" || e.key === "4") setView(VIEWS[Number(e.key) - 1].key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- обработчик читает свежие данные при каждом рендере
  }, [data, openCard, settings, filter.who, me]);

  // ─── Сохранённые фильтры ───
  const [views, setViews] = useState<{ id: string; name: string; query: string; shared: boolean; mine: boolean }[]>([]);
  useEffect(() => {
    boardsApi.views(board.id).then((r) => setViews(r.views), () => {});
  }, [board.id]);
  const saveView = async () => {
    const name = await promptText({ title: "Сохранить фильтр", text: "Вид, фильтры и дорожки — одной кнопкой в меню «Фильтры».", input: { placeholder: "Например, «Мои срочные»", maxLength: 60, required: true }, confirmLabel: "Сохранить" });
    if (!name?.trim()) return;
    try {
      await boardsApi.saveView({ boardId: board.id, name, query: filterQuery(filter, view, lanes) });
      setViews((await boardsApi.views(board.id)).views);
      toast("Фильтр сохранён");
    } catch (e) {
      toastError(e);
    }
  };
  const applyView = (query: string) => {
    const p = parseQuery(query);
    setFilter(p.filter);
    setView(p.view);
    setLanes(p.lanes);
  };

  const activeFilters = [filter.who, filter.labels?.length, filter.priority?.length, filter.due].filter(Boolean).length;

  return (
    <div className="flex flex-col gap-3" data-testid="board-app">
      {/* Шапка доски */}
      <div className="flex flex-wrap items-center gap-2">
        <Popover
          label="Другая доска"
          buttonClass="flex min-w-0 items-center gap-2 rounded-[var(--r-ctl)] px-1.5 py-1 text-left hover:bg-sunken"
          button={
            <>
              <span className="size-3 shrink-0 rounded-[4px]" style={{ background: `var(--color-${board.color === "slate" ? "muted" : board.color})` }} aria-hidden />
              <h1 className="truncate text-[20px] font-semibold tracking-tight">{board.name}</h1>
              <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden />
            </>
          }
        >
          {(close) => (
            <nav className="flex max-h-80 w-64 flex-col overflow-y-auto" aria-label="Доски">
              {boards.map((b) => (
                <Link key={b.id} href={`/admin/tasks/boards/${b.id}`} onClick={close} className={cn("flex items-center gap-2 rounded-[var(--r-ctl)] px-2 py-1.5 text-[13px] hover:bg-sunken", b.id === board.id && "bg-sunken font-semibold")}>
                  <span className="truncate">{b.name}</span>
                  {b.openCards ? <span className="count ml-auto">{b.openCards}</span> : null}
                </Link>
              ))}
              <Link href="/admin/tasks/boards" className="mt-1 border-t border-line px-2 pt-2 pb-1 text-[13px] text-wine hover:underline">
                Все доски
              </Link>
            </nav>
          )}
        </Popover>
        {loading ? <LoaderCircle className="size-4 animate-spin text-muted" aria-label="Обновляю" /> : null}
        <div className="ml-auto flex items-center gap-1.5">
          <div role="tablist" aria-label="Вид" className="no-scrollbar flex max-w-full overflow-x-auto rounded-[var(--r-ctl)] bg-sunken p-0.5 text-[13px]">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                role="tab"
                aria-selected={view === v.key}
                onClick={() => setView(v.key)}
                className={cn("inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-[calc(var(--r-ctl)-2px)] px-2.5 font-medium whitespace-nowrap transition-colors lg:min-h-7", view === v.key ? "bg-white text-ink shadow-[0_1px_2px_rgb(0_0_0/0.12),0_0_0_1px_rgb(0_0_0/0.04)]" : "text-muted hover:text-ink")}
              >
                <v.icon className="size-3.5" aria-hidden />
                <span className="max-sm:sr-only">{v.label}</span>
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-ghost btn-icon btn-sm max-lg:hidden" onClick={() => setHelp(true)} aria-label="Быстрые клавиши" title="Быстрые клавиши (?)">
            <Keyboard className="size-4" aria-hidden />
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setSettings(true)} title="Колонки, метки, участники и автоматизация">
            <Settings2 className="size-4" aria-hidden /> <span className="max-sm:sr-only">{board.canManage ? "Настроить" : "О доске"}</span>
          </button>
        </div>
      </div>

      {/* Фильтры одной строкой */}
      <div className="flex flex-wrap items-center gap-1.5" data-testid="board-filters">
        <div className="relative min-w-44 flex-1 sm:max-w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input ref={search} value={filter.q ?? ""} onChange={(e) => setF({ q: e.target.value || undefined })} onKeyDown={(e) => e.key === "Escape" && (setF({ q: undefined }), e.currentTarget.blur())} placeholder="Найти карточку  /" aria-label="Поиск карточек" type="search" className="input h-8 pl-8 text-[13px]" />
        </div>
        <button type="button" className="chip" aria-pressed={filter.who === "me"} onClick={() => setF({ who: filter.who === "me" ? undefined : "me" })} title="Мои карточки (q)">
          Мои
        </button>
        <button type="button" className="chip" aria-pressed={filter.due === "overdue"} onClick={() => setF({ due: filter.due === "overdue" ? undefined : "overdue" })}>
          Просрочено
        </button>
        <button type="button" className="chip max-sm:hidden" aria-pressed={filter.due === "today"} onClick={() => setF({ due: filter.due === "today" ? undefined : "today" })}>
          На сегодня
        </button>
        <Popover label="Фильтры" buttonClass={cn("chip", activeFilters && "border-ink")} button={<>Фильтры{activeFilters ? ` · ${activeFilters}` : ""}</>}>
          {() => (
            <div className="flex w-72 flex-col gap-3 text-[13px]">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-muted">Исполнитель</span>
                <select value={filter.who ?? ""} onChange={(e) => setF({ who: e.target.value || undefined })} className="input h-8 text-[13px]">
                  <option value="">Все</option>
                  <option value="me">Мои</option>
                  <option value="none">Без исполнителя</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              {data.labels.length ? (
                <div>
                  <span className="text-xs font-semibold text-muted">Метки</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {data.labels.map((l) => {
                      const on = !!filter.labels?.includes(l.id);
                      return (
                        <button key={l.id} type="button" aria-pressed={on} onClick={() => setF({ labels: on ? filter.labels!.filter((x) => x !== l.id) : [...(filter.labels ?? []), l.id] })} className={cn("rounded-[7px] p-0.5", on && "ring-2 ring-ink")}>
                          <LabelChip name={l.name} color={l.color} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <div>
                <span className="text-xs font-semibold text-muted">Приоритет</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(["urgent", "high", "normal", "low", "none"] as const).map((p) => {
                    const on = !!filter.priority?.includes(p);
                    return (
                      <button key={p} type="button" className="chip" aria-pressed={on} onClick={() => setF({ priority: on ? filter.priority!.filter((x) => x !== p) : [...(filter.priority ?? []), p] })}>
                        {p === "none" ? "Без" : priorityLabels[p]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <span className="text-xs font-semibold text-muted">Срок</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(
                    [
                      ["overdue", "Просрочено"],
                      ["today", "До конца дня"],
                      ["week", "7 дней"],
                      ["none", "Без срока"],
                    ] as const
                  ).map(([k, l]) => (
                    <button key={k} type="button" className="chip" aria-pressed={filter.due === k} onClick={() => setF({ due: filter.due === k ? undefined : k })}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={!!filter.done} onChange={(e) => setF({ done: e.target.checked || undefined })} className="size-4 accent-[var(--color-wine)]" />
                Выполненные за 90 дней (обычно — за {data.doneDays})
              </label>
              <div className="flex flex-wrap gap-1.5 border-t border-line pt-2">
                <button type="button" className="btn btn-outline btn-sm" onClick={saveView}>
                  <Bookmark className="size-3.5" aria-hidden /> Сохранить фильтр
                </button>
                {filtered || filter.done ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFilter({})}>
                    Сбросить
                  </button>
                ) : null}
              </div>
              {views.length ? (
                <div className="flex flex-col gap-0.5 border-t border-line pt-2">
                  <span className="text-xs font-semibold text-muted">Сохранённые</span>
                  {views.map((v) => (
                    <div key={v.id} className="flex items-center gap-1">
                      <button type="button" className="flex-1 truncate rounded-[var(--r-ctl)] px-2 py-1 text-left hover:bg-sunken" onClick={() => applyView(v.query)}>
                        {v.name}
                        {v.shared ? <span className="text-muted"> · общий</span> : null}
                      </button>
                      {v.mine ? (
                        <button type="button" className="btn btn-ghost btn-icon btn-sm size-6" aria-label={`Удалить фильтр ${v.name}`} onClick={() => boardsApi.deleteView(v.id).then(() => setViews((x) => x.filter((y) => y.id !== v.id)), toastError)}>
                          <Trash2 className="size-3.5" aria-hidden />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </Popover>
        {views.slice(0, 3).map((v) => (
          <button key={v.id} type="button" className="chip max-lg:hidden" onClick={() => applyView(v.query)} title="Сохранённый фильтр">
            <Bookmark className="size-3" aria-hidden /> {v.name}
          </button>
        ))}
        {view === "board" ? (
          <label className="ml-auto flex items-center gap-1.5 text-[13px] text-muted">
            <Rows3 className="size-4" aria-hidden />
            <span className="max-sm:sr-only">Дорожки</span>
            <select value={lanes} onChange={(e) => setLanes(e.target.value)} className="input h-8 w-auto py-0 text-[13px]" aria-label="Дорожки">
              <option value="none">Без дорожек</option>
              <option value="assignee">По исполнителю</option>
              <option value="label">По метке</option>
              <option value="priority">По приоритету</option>
            </select>
          </label>
        ) : null}
        <button type="button" className={cn("btn btn-sm", selecting ? "btn-dark" : "btn-ghost", view !== "board" && "ml-auto")} aria-pressed={selecting} onClick={() => (setSelecting((v) => !v), setSelected(new Set()))} title="Выбрать несколько карточек">
          <SquareCheck className="size-4" aria-hidden /> <span className="max-sm:sr-only">Выбрать</span>
        </button>
      </div>

      {filtered ? (
        <p className="-mt-1 text-xs text-muted">
          Показано {visible.length} из {data.cards.length}.{" "}
          <button type="button" className="text-wine hover:underline" onClick={() => setFilter({ done: filter.done })}>
            Сбросить фильтр
          </button>
        </p>
      ) : null}

      {view === "board" ? (
        <Kanban
          columns={data.columns}
          cards={visible}
          lanes={laneList}
          laneOf={laneOf}
          labels={labels}
          staff={names}
          canManage={board.canManage && !laneList}
          selected={selected}
          selecting={selecting}
          wideLabels={wideLabels}
          onHover={(id) => (hovered.current = id)}
          onOpen={setOpenCard}
          onSelect={toggleSelect}
          onToggleLabels={() => setWideLabels((v) => !v)}
          onMoveCard={moveCard}
          onMoveColumn={moveColumn}
          onQuickAdd={quickAdd}
          onColumnMenu={columnMenu}
          onAddColumn={addColumn}
          addingIn={addingIn}
          setAddingIn={setAddingIn}
        />
      ) : view === "list" ? (
        <ListView cards={visible} columns={data.columns} labels={labels} staff={names} selected={selected} onSelect={toggleSelect} onSelectAll={(ids) => setSelected(new Set(ids))} onOpen={setOpenCard} onHover={(id) => (hovered.current = id)} onDone={(c, done) => optimistic((cs) => cs.map((x) => (x.id === c.id ? { ...x, doneAt: done ? new Date().toISOString() : null } : x)), () => boardsApi.done(c.id, done))} />
      ) : view === "calendar" ? (
        <CalendarView boardId={board.id} staff={names} labels={labels} onOpen={setOpenCard} onCreate={async (dueAt) => {
          const title = await promptText({ title: "Новая карточка", text: `Срок — ${new Date(dueAt).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}`, input: { placeholder: "Что сделать", maxLength: 200, required: true }, confirmLabel: "Добавить" });
          if (title?.trim()) await boardsApi.createCard({ boardId: board.id, title, dueAt }).then(soon, toastError);
        }} filter={(c) => matchesFilter(c, filter, me, new Date())} />
      ) : (
        <TimelineView cards={visible} columns={data.columns} staff={names} labels={labels} onOpen={setOpenCard} onChange={(id, patch) => optimistic((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)), () => boardsApi.updateCard(id, patch))} />
      )}

      {/* Массовые действия */}
      {selected.size ? (
        <div className="sticky bottom-[calc(var(--tabbar-h,0px)+0.75rem)] z-20 mx-auto flex max-w-full flex-wrap items-center gap-1.5 rounded-[var(--r-sheet)] border border-line bg-white p-2 shadow-lift" role="toolbar" aria-label="Действия с выбранными">
          <span className="px-2 text-[13px] font-semibold tabular-nums">Выбрано: {selected.size}</span>
          <select className="input h-8 w-auto py-0 text-[13px]" value="" onChange={(e) => e.target.value && runBulk({ type: "move", columnId: e.target.value }, "Перенесено")} aria-label="Перенести в колонку">
            <option value="">В колонку…</option>
            {data.columns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className="input h-8 w-auto py-0 text-[13px]" value="" onChange={(e) => e.target.value && runBulk({ type: "assign", userId: e.target.value === "none" ? null : e.target.value }, "Назначено")} aria-label="Назначить">
            <option value="">Назначить…</option>
            <option value="none">Снять исполнителя</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          {data.labels.length ? (
            <select className="input h-8 w-auto py-0 text-[13px]" value="" onChange={(e) => e.target.value && runBulk({ type: "label", labelId: e.target.value, on: true }, "Метка добавлена")} aria-label="Добавить метку">
              <option value="">Метка…</option>
              {data.labels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          ) : null}
          <input type="date" className="input h-8 w-auto py-0 text-[13px]" aria-label="Срок" onChange={(e) => e.target.value && runBulk({ type: "due", dueAt: e.target.value }, "Срок поставлен")} />
          <button type="button" className="btn btn-outline btn-sm" onClick={() => runBulk({ type: "done", done: true }, "Выполнено")}>
            <CheckCheck className="size-4" aria-hidden /> Выполнено
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => runBulk({ type: "archive", archived: true }, "В архиве")}>
            <Archive className="size-4" aria-hidden /> В архив
          </button>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setSelected(new Set())} aria-label="Снять выбор">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : null}

      {openCard ? <CardDialog id={openCard} staff={staff} me={me} onClose={() => (setOpenCard(null), soon())} onChanged={soon} /> : null}
      {settings ? <BoardSettings data={data} staff={staff} me={me} onClose={() => setSettings(false)} onChanged={soon} onArchived={() => router.push("/admin/tasks/boards")} /> : null}
      {help ? <ShortcutHelp onClose={() => setHelp(false)} /> : null}
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ["n", "Новая карточка (в колонке под мышью или в первой)"],
  ["/", "Поиск по карточкам"],
  ["e или Enter", "Открыть карточку под мышью"],
  ["пробел", "Взять карточку под мышью себе (или снять)"],
  ["c", "Карточку под мышью — в архив"],
  ["q", "Только мои карточки"],
  ["1 – 4", "Доска, список, календарь, шкала"],
  ["Shift + клик", "Выбрать несколько карточек"],
  ["Esc", "Снять выбор, закрыть окно"],
  ["?", "Эта подсказка"],
];

function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => ref.current?.showModal(), []);
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} className="m-auto w-full max-w-md rounded-[var(--r-sheet)] border border-line bg-white p-5 text-ink shadow-lift backdrop:bg-ink/40">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">Быстрые клавиши</h2>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Закрыть">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-[13px]">
        {SHORTCUTS.map(([k, v]) => (
          <div key={k} className="contents">
            <dt>
              <kbd className="rounded border border-line-strong bg-sunken px-1.5 py-0.5 font-mono text-xs">{k}</kbd>
            </dt>
            <dd className="text-ink-soft">{v}</dd>
          </div>
        ))}
      </dl>
    </dialog>
  );
}
