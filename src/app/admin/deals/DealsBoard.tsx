"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { DndContext, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { Ban, BookOpen, CalendarClock, CalendarHeart, Check, Inbox, Repeat, X } from "lucide-react";
import { formatPrice } from "@/config/site";
import { ask, promptText, toast, toastError } from "@/components/ui/overlays";
import { acceptDealAction, moveDealAction, rejectDealAction } from "./actions";
import { lostReasons } from "@/modules/sales/domain/meta";
import { cn } from "@/lib/class-names";
import { progressRatio, progressShort, progressText } from "@/lib/content/crm-labels";
import { ruCount } from "@/i18n/plural";
import { Dot, Initials, dealNo } from "./ui";

export interface DealCard {
  id: string;
  number: number;
  title: string;
  contactName: string;
  stageId: string;
  amount: number;
  /** Принято денег по сделке, ₸. */
  paid?: number;
  source: string;
  assigneeId: string | null;
  assigneeLabel: string | null;
  daysInStage: number;
  task: { overdue: boolean; label: string } | null;
  unread: number;
  tags: string[];
  unsorted: boolean;
  book: { theme: string; answered: number; total: number; words: number } | null;
  /** Дата события из своего поля «Дата события» (YYYY-MM-DD). */
  eventDate: string | null;
  /** Покупок клиента до этой сделки (deals-24): больше нуля — «повторный». */
  repeat?: number;
}

interface Stage {
  id: string;
  name: string;
  color: string;
  kind: "open" | "won" | "lost";
}

/**
 * Откат одной карточки после отказа сервера — прежний снимок только её: остальные карточки за это время могли обновиться
 * с сервера (фильтр, router.refresh()), и вернуть всю доску к старому снимку — потерять эти изменения.
 */
export function restoreCard(cards: DealCard[], before: DealCard): DealCard[] {
  return cards.some((c) => c.id === before.id) ? cards.map((c) => (c.id === before.id ? before : c)) : [...cards, before];
}

/** Причина для руководителя, когда менеджер предлагает отклонить заявку или отметить спамом; null — передумал. */
export function askRejectReason(spam: boolean) {
  return promptText({ title: spam ? "Почему это спам?" : "Почему отклонить?", text: "Руководитель увидит причину.", confirmLabel: "Отправить руководителю", input: { placeholder: "Например: реклама, ошиблись номером", maxLength: 200 } });
}

/**
 * canDecide — руководитель: берёт и отклоняет любые заявки. Менеджер (meId) работает только со своими, а отклонить
 * или отметить спамом лишь предлагает — заявка остаётся на доске с отметкой.
 *
 * Компьютер: колонки рядом, у каждой этап, число сделок и сумма. Телефон: одна лента — этап выбирают полосой сверху
 * (нажатием или свайпом по ленте), на полосу же можно перетащить карточку.
 */
export function DealsBoard({ stages, initial, canEdit, canDecide, meId }: { stages: Stage[]; initial: DealCard[]; canEdit: boolean; canDecide: boolean; meId: string }) {
  const [cards, setCards] = useState(initial);
  // Next не пересоздаёт доску при новых данных с сервера (router.refresh(), ответ действия) — берём новый список сами.
  const [shown, setShown] = useState(initial);
  if (shown !== initial) {
    setShown(initial);
    setCards(initial);
  }
  const [lost, setLost] = useState<{ id: string; stageId: string } | null>(null);
  const [, start] = useTransition();
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }));

  /** Оптимистичная правка карточки; отказ сервера — откат только её и текст отказа. */
  const optimistic = (id: string, patch: (c: DealCard) => DealCard | null, run: () => Promise<{ ok: boolean; message?: string }>) => {
    const before = cards.find((c) => c.id === id);
    if (!before) return;
    setCards((cs) => cs.flatMap((c) => (c.id === id ? (patch(c) ?? []) : [c])));
    start(async () => {
      try {
        const r = await run();
        if (!r.ok) {
          setCards((cs) => restoreCard(cs, before));
          toast(r.message ?? "", "error");
        } else if (r.message) toast(r.message);
      } catch (err) {
        setCards((cs) => restoreCard(cs, before));
        toastError(err);
      }
    });
  };

  const move = (id: string, stageId: string, reason?: string) => optimistic(id, (c) => ({ ...c, stageId, daysInStage: c.stageId === stageId ? c.daysInStage : 0, unsorted: false }), () => moveDealAction(id, stageId, reason));

  const onDragEnd = (e: DragEndEvent) => {
    const id = String(e.active.id);
    // Цель — колонка (id этапа) или вкладка этапа на телефоне (tab:<id этапа>).
    const to = e.over?.id ? String(e.over.id).replace(/^tab:/, "") : null;
    const card = cards.find((c) => c.id === id);
    if (!card || !to || to === "unsorted" || (card.stageId === to && !card.unsorted)) return;
    if (stages.find((s) => s.id === to)?.kind === "lost") setLost({ id, stageId: to });
    else move(id, to);
  };

  // Телефон: одна колонка на экран — этап выбирают полосой сверху (на неё же можно перетащить карточку). Без вложенной
  // прокрутки: карточки идут в ленте страницы, а не в окне внутри колонки внутри доски.
  const unsortedCards = cards.filter((c) => c.unsorted);
  const [picked, setPicked] = useState<string | null>(null);
  const firstWithCards = unsortedCards.length ? "unsorted" : (stages.find((s) => cards.some((c) => c.stageId === s.id && !c.unsorted))?.id ?? stages[0]?.id);
  const current = picked === "unsorted" ? (unsortedCards.length ? "unsorted" : firstWithCards) : picked && stages.some((s) => s.id === picked) ? picked : firstWithCards;
  const order = [...(unsortedCards.length ? ["unsorted"] : []), ...stages.map((s) => s.id)];

  // Полоса этапов листается вбок: выбранный этап — в середине видимой части (без прокрутки страницы).
  const ribbon = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = ribbon.current;
    const here = box?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (box && here && box.scrollWidth > box.clientWidth) box.scrollTo({ left: here.offsetLeft - (box.clientWidth - here.offsetWidth) / 2, behavior: "smooth" });
  }, [current]);

  // Свайп по ленте карточек — соседний этап. Перетаскивание карточки начинается с удержания, поэтому быстрый жест не мешает.
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onSwipeEnd = (e: React.TouchEvent) => {
    const from = swipe.current;
    swipe.current = null;
    const t = e.changedTouches[0];
    if (!from || !t) return;
    const dx = t.clientX - from.x;
    const dy = t.clientY - from.y;
    if (Math.abs(dx) < 70 || Math.abs(dy) > 45 || Math.abs(dx) < Math.abs(dy) * 2) return;
    const next = order[order.indexOf(current ?? "") + (dx < 0 ? 1 : -1)];
    if (next) setPicked(next);
  };

  const currentCards = current === "unsorted" ? unsortedCards : cards.filter((c) => c.stageId === current && !c.unsorted);
  const currentSum = currentCards.reduce((s, c) => s + c.amount, 0);
  const currentName = current === "unsorted" ? "Неразобранное" : (stages.find((s) => s.id === current)?.name ?? "");

  return (
    <>
      <DndContext id="deals-board" sensors={sensors} onDragEnd={canEdit ? onDragEnd : undefined}>
        <div className="sticky top-[var(--topbar-h)] z-10 -mx-4 bg-canvas px-4 pt-1 lg:hidden">
          <div ref={ribbon} className="tabs m-hscroll" role="tablist" aria-label="Этапы воронки" data-testid="stage-tabs">
            {unsortedCards.length ? (
              <button type="button" role="tab" aria-selected={current === "unsorted"} onClick={() => setPicked("unsorted")} className="tab">
                <Inbox className="size-4 text-wine" aria-hidden /> Неразобранное <span className="count count-alert">{unsortedCards.length}</span>
              </button>
            ) : null}
            {stages.map((s) => (
              <StageTab key={s.id} stage={s} count={cards.filter((c) => c.stageId === s.id && !c.unsorted).length} selected={current === s.id} onSelect={() => setPicked(s.id)} />
            ))}
          </div>
          <div className="flex items-baseline justify-between gap-3 py-2.5 text-sm" aria-live="polite">
            <span className="min-w-0 truncate font-semibold">{currentName}</span>
            <span className="shrink-0 text-muted tabular-nums">{currentCards.length ? `${ruCount(currentCards.length, "сделка", "сделки", "сделок")}${currentSum ? `, ${formatPrice(currentSum)}` : ""}` : "пусто"}</span>
          </div>
        </div>
        <div
          className="flex flex-col gap-3 lg:-mx-6 lg:flex-row lg:items-start lg:gap-3 lg:overflow-x-auto lg:px-6 lg:pb-4 2xl:-mx-8 2xl:px-8"
          data-testid="deals-board"
          onTouchStart={(e) => (swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
          onTouchEnd={onSwipeEnd}
        >
          {unsortedCards.length ? (
            <UnsortedColumn
              hidden={current !== "unsorted"}
              cards={unsortedCards}
              canEdit={canEdit}
              onAccept={(id) => optimistic(id, (c) => ({ ...c, unsorted: false }), () => acceptDealAction(id))}
              canWork={(c) => canDecide || c.assigneeId === meId}
              onReject={async (id, spam) => {
                if (!canDecide) {
                  const reason = await askRejectReason(spam);
                  if (reason === null) return;
                  start(async () => {
                    try {
                      toast((await rejectDealAction(id, spam, reason)).message);
                      const tag = spam ? "запрос: спам" : "запрос: отклонить";
                      setCards((cs) => cs.map((c) => (c.id === id ? { ...c, tags: [...c.tags, tag] } : c)));
                    } catch (err) {
                      toastError(err);
                    }
                  });
                  return;
                }
                if (!(await ask(spam ? "Пометить как спам? Сделка удалится, с этого номера больше не будет заявок и уведомлений." : "Отклонить заявку? Сделка удалится, переписка и звонки останутся.", true))) return;
                // Заявку с деньгами или счётом сервер не удаляет, а закрывает «отказом» — это скажет тост, доска обновится сама.
                optimistic(id, () => null, async () => ({ ok: true, message: (await rejectDealAction(id, spam)).message }));
              }}
            />
          ) : null}
          {stages.map((s) => (
            <Column key={s.id} stage={s} hidden={current !== s.id} cards={cards.filter((c) => c.stageId === s.id && !c.unsorted)} draggable={canEdit} />
          ))}
        </div>
      </DndContext>
      {lost ? (
        <LostDialog
          onCancel={() => setLost(null)}
          onSubmit={(reason) => {
            move(lost.id, lost.stageId, reason);
            setLost(null);
          }}
        />
      ) : null}
    </>
  );
}

/** Этап на полосе телефона: выбор колонки и цель для перетаскивания карточки на другой этап. */
function StageTab({ stage, count, selected, onSelect }: { stage: Stage; count: number; selected: boolean; onSelect: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `tab:${stage.id}` });
  return (
    <button ref={setNodeRef} type="button" role="tab" aria-selected={selected} onClick={onSelect} className={cn("tab max-lg:h-11 max-lg:text-sm", isOver && "bg-rose")}>
      <Dot color={stage.color} />
      {stage.name} <span className="count">{count}</span>
    </button>
  );
}

/** Колонка доски: на ноутбуке — рядом с другими, со своей прокруткой; на телефоне — вся ширина, только выбранная. */
const columnClass = (hidden: boolean) => cn("flex min-w-0 flex-col lg:min-w-64 lg:flex-1 lg:basis-64 lg:rounded-[var(--r-panel)] lg:bg-sunken/70 lg:p-2", "lg:max-w-80", hidden && "max-lg:hidden");
const listClass = "flex flex-col gap-2 lg:max-h-[calc(100dvh-var(--topbar-h)-14rem)] lg:min-h-24 lg:overflow-y-auto lg:overscroll-contain";

function UnsortedColumn({ cards, canEdit, canWork, onAccept, onReject, hidden }: { cards: DealCard[]; canEdit: boolean; canWork: (c: DealCard) => boolean; onAccept: (id: string) => void; onReject: (id: string, spam: boolean) => void; hidden: boolean }) {
  const sum = cards.reduce((s, c) => s + c.amount, 0);
  return (
    <section className={cn(columnClass(hidden), "lg:border lg:border-dashed lg:border-wine/40 lg:bg-rose/40")} data-stage="Неразобранное" aria-label="Неразобранное">
      <header className="px-1 pb-2 max-lg:hidden">
        <div className="flex items-center gap-2">
          <Inbox className="size-4 text-wine" aria-hidden />
          <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold">Неразобранное</h2>
          <span className="count count-alert">{cards.length}</span>
        </div>
        <p className="mt-1 text-xs text-muted">{sum ? `${formatPrice(sum)}. ` : ""}Новые номера: примите заявку в работу или отклоните.</p>
      </header>
      <p className="pb-2 text-xs text-muted lg:hidden">Новые номера: ответственный принимает заявку в работу или отклоняет.</p>
      <div className={listClass}>
        {cards.map((c) => (
          <div key={c.id} className="rounded-[var(--r-ctl)] border border-line bg-white p-2.5 text-sm" data-deal={c.number} data-unsorted="1">
            <Card card={c} draggable={canEdit} bare />
            {canEdit && canWork(c) ? (
              <div className="mt-2.5 flex gap-1.5 border-t border-line pt-2">
                <button className="btn btn-dark btn-sm flex-1 max-lg:h-11" onClick={() => onAccept(c.id)}>
                  <Check className="size-4" aria-hidden /> Принять
                </button>
                <button className="btn btn-ghost btn-sm btn-icon max-lg:size-11" onClick={() => onReject(c.id, false)} title="Отклонить" aria-label={`Отклонить заявку ${dealNo(c.number)}`}>
                  <X className="size-4" aria-hidden />
                </button>
                <button className="btn btn-ghost btn-sm btn-icon text-danger hover:text-danger max-lg:size-11" onClick={() => onReject(c.id, true)} title="Спам" aria-label={`Заявка ${dealNo(c.number)} — спам`}>
                  <Ban className="size-4" aria-hidden />
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function Column({ stage, cards, draggable, hidden }: { stage: Stage; cards: DealCard[]; draggable: boolean; hidden: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const sum = cards.reduce((s, c) => s + c.amount, 0);
  return (
    <section ref={setNodeRef} className={cn(columnClass(hidden), "transition-shadow", isOver && "ring-2 ring-wine/40")} data-stage={stage.name} aria-label={stage.name}>
      <header className="px-1 pb-2 max-lg:hidden">
        <div className="flex items-center gap-2">
          <Dot color={stage.color} className="size-2" />
          <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold" title={stage.name}>
            {stage.name}
          </h2>
          <span className="count">{cards.length}</span>
        </div>
        <div className="mt-0.5 flex items-baseline gap-2 pl-4 text-xs text-muted tabular-nums">
          <span>{sum ? formatPrice(sum) : "—"}</span>
          {stage.kind !== "open" ? <span>{stage.kind === "won" ? "успех, за 30 дней" : "отказ, за 30 дней"}</span> : null}
        </div>
      </header>
      <div className={listClass}>
        {cards.map((c) => (
          <Card key={c.id} card={c} draggable={draggable} />
        ))}
        {cards.length === 0 ? <p className="rounded-[var(--r-ctl)] border border-dashed border-line-strong/70 px-3 py-6 text-center text-xs text-muted">{draggable ? "Перетащите сюда сделку" : "Сделок нет"}</p> : null}
      </div>
    </section>
  );
}

/** Срок карточки: просрочен — красным и словом, нет задачи — предупреждением, иначе — приглушённой датой. Цвет с точкой и подписью. */
function Due({ task }: { task: DealCard["task"] }) {
  if (!task)
    return (
      <span className="inline-flex items-center gap-1 text-warning" title="У сделки нет запланированной задачи">
        <Dot className="bg-warning" /> нет задачи
      </span>
    );
  return (
    <span className={cn("inline-flex items-center gap-1 tabular-nums", task.overdue ? "font-medium text-danger" : "text-muted")} title={task.overdue ? "Задача просрочена" : "Следующая задача"}>
      {task.overdue ? <Dot className="bg-danger" /> : <CalendarClock className="size-3.5" aria-hidden />}
      {task.overdue ? "просрочена " : ""}
      {task.label}
    </span>
  );
}

function Card({ card: c, draggable, bare }: { card: DealCard; draggable: boolean; bare?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: c.id, disabled: !draggable });
  return (
    <article
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn(
        !bare && "rounded-[var(--r-ctl)] border border-line bg-white p-2.5 transition-[border-color] hover:border-line-strong",
        "text-sm",
        draggable && "cursor-grab touch-manipulation active:cursor-grabbing",
        isDragging && "relative z-10 rotate-1 bg-white shadow-lift",
      )}
      data-deal={bare ? undefined : c.number}
    >
      <div className="flex items-start gap-2">
        <Link href={`/admin/deals/${c.id}`} className="line-clamp-2 min-w-0 flex-1 text-[13.5px] leading-snug font-semibold hover:text-wine" onPointerDown={(e) => e.stopPropagation()}>
          {c.title}
        </Link>
        {c.unread ? (
          <span className="count count-alert shrink-0" title={`Непрочитанных сообщений: ${c.unread}`}>
            {c.unread}
          </span>
        ) : null}
      </div>
      <div className="mt-0.5 truncate text-xs text-muted">
        <span className="tabular-nums">{dealNo(c.number)}</span>
        {c.contactName ? <span className="text-ink-soft"> {c.contactName}</span> : null}
        <span> · {c.source}</span>
      </div>
      {c.book ? (
        <div className="mt-2 flex items-center gap-1.5" title={`Книга: ${progressText(c.book)}`}>
          <BookOpen className="size-3.5 shrink-0 text-muted" aria-hidden />
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-wine" style={{ width: `${Math.round(progressRatio(c.book) * 100)}%` }} />
          </div>
          <span className="text-[11px] text-muted tabular-nums">{progressShort(c.book)}</span>
        </div>
      ) : null}
      <div className="mt-2 flex items-center gap-2 text-xs">
        <span className="text-[13px] font-semibold tabular-nums">{c.amount ? formatPrice(c.amount) : <span className="font-normal text-muted">без суммы</span>}</span>
        {c.paid ? (
          <span className="truncate text-success tabular-nums" title="Получено платежами">
            +{formatPrice(c.paid)}
          </span>
        ) : null}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {c.daysInStage > 0 ? (
            <span className="text-[11px] text-muted tabular-nums" title="Дней на этом этапе">
              {c.daysInStage} дн.
            </span>
          ) : null}
          <Initials label={c.assigneeLabel} />
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <Due task={c.task} />
        {c.eventDate ? <EventChip date={c.eventDate} /> : null}
        {c.repeat ? (
          <span className="inline-flex items-center gap-1 text-info" title={`Покупок до этой сделки: ${c.repeat}`}>
            <Repeat className="size-3" aria-hidden /> повторный
          </span>
        ) : null}
        {c.tags.slice(0, 2).map((t) => (
          <span key={t} className="max-w-28 truncate text-wine">
            {t}
          </span>
        ))}
      </div>
    </article>
  );
}

export function LostDialog({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const titleId = useId();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Фокус — в поле причины; закрыли — обратно туда, откуда открывали (карточка, этап, выбор в списке).
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    input.current?.focus();
    return () => back?.focus();
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4" onClick={onCancel}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-t-[var(--r-sheet)] bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-lift sm:rounded-[var(--r-sheet)]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onCancel();
          }
        }}
        onSubmit={(e) => {
          e.preventDefault();
          if (reason.trim()) onSubmit(reason.trim());
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id={titleId} className="text-lg font-semibold">
              Причина отказа
            </h3>
            <p className="mt-0.5 text-sm text-muted">Сделка закроется. Причина попадёт в аналитику отказов.</p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Закрыть" className="btn btn-ghost btn-icon btn-sm -mt-1 -mr-2 max-lg:size-11">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {lostReasons.map((r) => (
            <button type="button" key={r} onClick={() => setReason(r)} aria-pressed={reason === r} className="chip max-lg:h-10">
              {r}
            </button>
          ))}
        </div>
        <input ref={input} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Или своими словами" aria-label="Причина отказа" className="input mt-3 text-sm" />
        <div className="mt-5 flex justify-end gap-2 max-sm:[&>*]:flex-1">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
            Отмена
          </button>
          <button className="btn btn-dark btn-sm" disabled={!reason.trim()}>
            Закрыть сделку
          </button>
        </div>
      </form>
    </div>
  );
}

/** Дата события клиента: чем ближе, тем заметнее — книгу надо успеть напечатать. */
function EventChip({ date }: { date: string }) {
  const [y, m, d] = date.split("-").map(Number);
  const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())) / 86_400_000);
  const label = `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}`;
  return (
    <span className={cn("inline-flex items-center gap-1 tabular-nums", days >= 0 && days <= 14 ? "font-medium text-danger" : days >= 0 ? "text-info" : "text-muted")} title={days >= 0 ? `Событие через ${days} дн.` : "Событие прошло"}>
      <CalendarHeart className="size-3.5" aria-hidden />
      {label}
      {days >= 0 && days <= 30 ? `, через ${days} дн.` : ""}
    </span>
  );
}
