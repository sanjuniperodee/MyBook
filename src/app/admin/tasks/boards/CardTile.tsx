"use client";

import { AlignLeft, Bot, CheckSquare, Link2, MessageSquare, Paperclip, Repeat } from "lucide-react";
import { cn } from "@/lib/class-names";
import type { CardSummary } from "./client";
import { Avatars, DueBadge, LabelChip, PriorityMark, colorOf, kindIcons } from "./ui";

/**
 * Карточка на доске: обложка, метки, название, значки (срок, чек-лист, комментарии, вложения, описание, повтор),
 * связь с клиентом и исполнители. Нажатие открывает карточку; перетаскивание — через обёртку Kanban.
 */
export function CardTile({
  card: c,
  labels,
  staff,
  wideLabels,
  selected,
  selecting,
  onOpen,
  onSelect,
  onToggleLabels,
  dragging,
}: {
  card: CardSummary;
  labels: Map<string, { name: string; color: string }>;
  staff: Map<string, string>;
  wideLabels: boolean;
  selected?: boolean;
  selecting?: boolean;
  onOpen: () => void;
  onSelect?: () => void;
  onToggleLabels?: () => void;
  dragging?: boolean;
}) {
  const KindIcon = kindIcons[c.kind];
  const cardLabels = c.labelIds.map((id) => labels.get(id)).filter((l): l is { name: string; color: string } => !!l);
  const done = !!c.doneAt;
  return (
    <article
      className={cn(
        "group/card relative overflow-hidden rounded-[var(--r-ctl)] border border-line bg-white text-sm transition-[border-color,box-shadow] hover:border-line-strong",
        selected && "ring-2 ring-wine",
        dragging && "rotate-[1.5deg] shadow-lift",
        done && "opacity-75",
      )}
      data-card={c.id}
    >
      {c.cover && "image" in c.cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- вложение из хранилища, размер заранее неизвестен
        <img src={c.cover.image} alt="" loading="lazy" draggable={false} className="block max-h-36 w-full bg-sunken object-cover" />
      ) : c.cover && "color" in c.cover ? (
        <div className="h-8 w-full" style={{ background: colorOf(c.cover.color) }} aria-hidden />
      ) : null}
      <button
        type="button"
        onClick={(e) => (selecting || e.shiftKey || e.metaKey || e.ctrlKey ? onSelect?.() : onOpen())}
        className="block w-full px-2.5 pt-2 pb-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-wine"
        aria-label={`Карточка «${c.title}»`}
      >
        {cardLabels.length ? (
          <span
            className="mb-1.5 flex flex-wrap gap-1"
            onClick={(e) => {
              if (!onToggleLabels) return;
              e.stopPropagation();
              onToggleLabels();
            }}
          >
            {cardLabels.map((l, i) => (
              <LabelChip key={i} name={l.name} color={l.color} compact={!wideLabels} />
            ))}
          </span>
        ) : null}
        <span className={cn("flex items-start gap-1.5 text-[13.5px] leading-snug font-medium text-ink", done && "text-muted line-through decoration-1")}>
          {KindIcon ? <KindIcon className="mt-0.5 size-3.5 shrink-0 text-muted" aria-label="" /> : null}
          <span className="line-clamp-3 min-w-0 break-words">{c.title}</span>
        </span>
        {c.linkLabel ? (
          <span className="mt-1 flex items-center gap-1 truncate text-xs text-muted">
            <Link2 className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{c.linkLabel}</span>
          </span>
        ) : null}
        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <DueBadge dueAt={c.dueAt} doneAt={c.doneAt} />
          <PriorityMark priority={c.priority} />
          {c.checklist.total ? (
            <span className={cn("inline-flex items-center gap-0.5 rounded-[6px] px-1 tabular-nums", c.checklist.done === c.checklist.total && "bg-success-bg text-success")} title="Чек-лист">
              <CheckSquare className="size-3" aria-hidden />
              {c.checklist.done}/{c.checklist.total}
            </span>
          ) : null}
          {c.comments ? (
            <span className="inline-flex items-center gap-0.5 tabular-nums" title="Комментарии">
              <MessageSquare className="size-3" aria-hidden />
              {c.comments}
            </span>
          ) : null}
          {c.attachments ? (
            <span className="inline-flex items-center gap-0.5 tabular-nums" title="Вложения">
              <Paperclip className="size-3" aria-hidden />
              {c.attachments}
            </span>
          ) : null}
          {c.hasDescription ? <AlignLeft className="size-3" aria-label="Есть описание" /> : null}
          {c.recurring ? <Repeat className="size-3" aria-label="Повторяется" /> : null}
          {c.fromBot ? <Bot className="size-3" aria-label="Поставил бот" /> : null}
          <span className="ml-auto">
            <Avatars ids={c.assigneeIds} staff={staff} />
          </span>
        </span>
      </button>
      {onSelect ? (
        <label className={cn("absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-[6px] bg-white/90", selecting || selected ? "" : "opacity-0 group-hover/card:opacity-100 focus-within:opacity-100 max-lg:hidden")}>
          <input type="checkbox" checked={!!selected} onChange={onSelect} aria-label="Выбрать карточку" className="size-4 accent-[var(--color-wine)]" onClick={(e) => e.stopPropagation()} />
        </label>
      ) : null}
    </article>
  );
}
