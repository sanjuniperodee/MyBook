"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bookmark, Tag, Trash2, User, Users, X } from "lucide-react";
import { ask, toast, toastError } from "@/components/ui/overlays";
import { bulkDealsAction, deleteViewAction, saveViewAction } from "./actions";
import { LostDialog } from "./DealsBoard";
import { cn } from "@/lib/class-names";
import { useRowSelection } from "@/components/admin/useRowSelection";
import { StageLabel } from "./StageLabel";

interface DealRow {
  id: string;
  number: number;
  title: string;
  contactName: string;
  stage: { name: string; color: string };
  lostReason: string | null;
  channel: string;
  campaign: string | null;
  assignee: string | null;
  amount: string;
  paid?: string | null;
  created: string;
}

export function DealsTable({
  rows,
  stages,
  staff,
  canEdit,
  canDelete,
  empty = null,
}: {
  rows: DealRow[];
  stages: { id: string; name: string; kind: string }[];
  staff: { id: string; label: string }[];
  canEdit: boolean;
  canDelete: boolean;
  /** Что показать, когда сделок нет (подсказка «сбросить фильтры» или «создать сделку»). */
  empty?: React.ReactNode;
}) {
  const { selected, all, ids, toggle, toggleAll, clear } = useRowSelection(rows);
  const [lostFor, setLostFor] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (input: Parameters<typeof bulkDealsAction>[1]) =>
    start(async () => {
      try {
        const r = await bulkDealsAction(ids(), input);
        if (r.error) return toast(r.error, "error");
        toast(r.skipped ? `Готово: ${r.done}, пропущено (нет доступа${input.op === "delete" ? " или у сделки деньги или счёт клиента" : ""}): ${r.skipped}` : `Готово: ${r.done}`);
        clear();
        router.refresh();
      } catch (e) {
        toastError(e);
      }
    });

  return (
    <div className="space-y-3 lg:space-y-0 lg:overflow-hidden lg:rounded-[14px] lg:border lg:border-line lg:bg-white">
      {selected.size && canEdit ? (
        <div className="m-sticky-actions flex flex-wrap items-center gap-2 border-line bg-rose px-4 py-2.5 text-sm max-lg:rounded-[14px] max-lg:border max-lg:shadow-lift lg:sticky lg:top-0 lg:z-10 lg:border-b" data-testid="bulk-bar" role="region" aria-label="Действия с выбранными">
          <span className="font-medium tabular-nums">Выбрано: {selected.size}</span>
          <select
            className="input h-9 w-auto min-w-44 text-sm max-lg:flex-1"
            defaultValue=""
            disabled={pending}
            aria-label="Перевести на этап"
            onChange={(e) => {
              const id = e.target.value;
              e.target.value = "";
              if (!id) return;
              if (stages.find((s) => s.id === id)?.kind === "lost") setLostFor(id);
              else run({ op: "stage", stageId: id });
            }}
          >
            <option value="">Перевести на этап…</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            className="input h-9 w-auto min-w-44 text-sm max-lg:flex-1"
            defaultValue=""
            disabled={pending}
            aria-label="Назначить ответственного"
            onChange={(e) => {
              const v = e.target.value;
              e.target.value = "";
              if (v) run({ op: "assign", userId: v === "none" ? null : v });
            }}
          >
            <option value="">Ответственный…</option>
            <option value="none">Снять ответственного</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const tag = new FormData(e.currentTarget).get("tag")?.toString().trim();
              if (tag) run({ op: "tag", tag });
              e.currentTarget.reset();
            }}
          >
            <input name="tag" maxLength={30} placeholder="Тег" className="input h-9 w-28 text-sm" aria-label="Добавить тег" />
            <button className="btn btn-outline btn-sm" disabled={pending}>
              <Tag className="size-4" aria-hidden /> Добавить
            </button>
          </form>
          {canDelete ? (
            <button className="btn btn-ghost btn-sm text-danger hover:text-danger" disabled={pending} onClick={async () => (await ask(`Удалить ${selected.size} сделок? Задачи и история по ним тоже удалятся.`, true)) && run({ op: "delete" })}>
              <Trash2 className="size-4" aria-hidden /> Удалить
            </button>
          ) : null}
          <button className="btn btn-ghost btn-icon btn-sm ml-auto" onClick={clear} aria-label="Снять выделение">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : null}
      {rows.length ? (
        <>
          <ul className="space-y-2 lg:hidden" data-testid="deals-cards">
            {rows.map((r) => (
              <li key={r.id} className={cn("panel m-card flex items-stretch overflow-hidden", selected.has(r.id) && "border-wine/40 bg-rose/40")}>
                {canEdit ? (
                  <label className="flex w-11 shrink-0 cursor-pointer items-start justify-center pt-4">
                    <input type="checkbox" className="size-4 accent-wine" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Выбрать сделку ${r.number}`} />
                  </label>
                ) : null}
                <Link href={`/admin/deals/${r.id}`} className={cn("block min-w-0 flex-1 py-3.5 pr-4", !canEdit && "pl-4")}>
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 text-[15px] leading-snug font-semibold">{r.title}</div>
                      <div className="mt-0.5 truncate text-sm text-muted">
                        {r.contactName ? `${r.contactName} · ` : ""}№{r.number} · {r.created}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[15px] font-semibold whitespace-nowrap tabular-nums">{r.amount}</div>
                      {r.paid ? <div className="text-xs text-success tabular-nums">получено {r.paid}</div> : null}
                    </div>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
                    <StageLabel name={r.stage.name} color={r.stage.color} />
                    {r.lostReason ? <span className="text-muted">{r.lostReason}</span> : null}
                    {r.assignee ? (
                      <span className="badge" title="Ответственный">
                        <User className="size-3" aria-hidden /> {r.assignee}
                      </span>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto lg:block">
            <table className="table min-w-[860px] [&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th:first-child]:pl-5 [&_th:last-child]:pr-5">
              <thead>
                <tr>
                  {canEdit ? (
                    <th className="w-10">
                      <input type="checkbox" className="size-4 align-middle accent-wine" checked={all} onChange={toggleAll} aria-label="Выбрать все" />
                    </th>
                  ) : null}
                  <th className="w-14">№</th>
                  <th>Сделка</th>
                  <th>Этап</th>
                  <th>Канал</th>
                  <th>Ответственный</th>
                  <th className="text-right">Бюджет</th>
                  <th>Создана</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={cn(selected.has(r.id) && "[&>td]:bg-rose/50")}>
                    {canEdit ? (
                      <td>
                        <input type="checkbox" className="size-4 align-middle accent-wine" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Выбрать сделку ${r.number}`} />
                      </td>
                    ) : null}
                    <td className="text-muted tabular-nums">
                      <Link href={`/admin/deals/${r.id}`} className="hover:text-wine">
                        {r.number}
                      </Link>
                    </td>
                    <td className="max-w-80">
                      <Link href={`/admin/deals/${r.id}`} className="block truncate font-medium hover:text-wine">
                        {r.title}
                      </Link>
                      {r.contactName ? <span className="block truncate text-xs text-muted">{r.contactName}</span> : null}
                    </td>
                    <td>
                      <StageLabel name={r.stage.name} color={r.stage.color} />
                      {r.lostReason ? <span className="mt-0.5 block max-w-48 truncate text-xs text-muted">{r.lostReason}</span> : null}
                    </td>
                    <td className="text-ink-soft">
                      {r.channel}
                      {r.campaign ? <span className="block max-w-48 truncate text-xs text-muted">{r.campaign}</span> : null}
                    </td>
                    <td>{r.assignee ?? <span className="text-muted">не назначен</span>}</td>
                    <td className="text-right font-medium whitespace-nowrap tabular-nums">
                      {r.amount}
                      {r.paid ? <span className="block text-xs font-normal text-success">получено {r.paid}</span> : null}
                    </td>
                    <td className="whitespace-nowrap text-muted">{r.created}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="panel lg:rounded-none lg:border-0">{empty}</div>
      )}
      {lostFor ? (
        <LostDialog
          onCancel={() => setLostFor(null)}
          onSubmit={(reason) => {
            run({ op: "stage", stageId: lostFor, reason });
            setLostFor(null);
          }}
        />
      ) : null}
    </div>
  );
}

/** Сохранённые фильтры: свои и общие; «Сохранить» запоминает текущие параметры списка. */
export function SavedViews({ views, query, canShare }: { views: { id: string; name: string; query: string; mine: boolean; shared: boolean }[]; query: string; canShare: boolean }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <div className="flex shrink-0 items-center gap-2 lg:flex-wrap" data-testid="saved-views">
      {views.map((v) => (
        <span key={v.id} className={cn("chip max-lg:h-10 gap-1 pr-1", v.query === query && "chip-on")}>
          <Link href={`/admin/deals${v.query ? `?${v.query}` : ""}`} className="flex items-center gap-1.5" title={v.shared ? "Общий фильтр — виден всем" : undefined} aria-current={v.query === query ? "true" : undefined}>
            {v.shared ? <Users className="size-3.5" aria-hidden /> : <Bookmark className="size-3.5" aria-hidden />}
            {v.name}
          </Link>
          {v.mine ? (
            <button className="flex size-6 items-center justify-center rounded-md opacity-60 hover:opacity-100" disabled={pending} onClick={() => start(async () => void (await deleteViewAction(v.id), router.refresh()))} aria-label={`Удалить фильтр ${v.name}`}>
              <X className="size-3.5" aria-hidden />
            </button>
          ) : (
            <span className="w-1.5" />
          )}
        </span>
      ))}
      {query && !open ? (
        <button className="btn btn-ghost btn-sm shrink-0 text-wine" onClick={() => setOpen(true)}>
          <Bookmark className="size-4" aria-hidden /> Сохранить фильтр
        </button>
      ) : null}
      {open ? (
        <form
          className="flex shrink-0 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            start(async () => {
              try {
                await saveViewAction(String(f.get("name") ?? ""), query, f.get("shared") === "on");
                setOpen(false);
                router.refresh();
              } catch (err) {
                toastError(err);
              }
            });
          }}
        >
          <input name="name" autoFocus required maxLength={40} placeholder="Например, «Горящие к Новому году»" aria-label="Название фильтра" className="input h-9 w-64 text-sm" />
          {canShare ? (
            <label className="flex items-center gap-1.5 text-sm text-ink-soft">
              <input type="checkbox" name="shared" className="size-4 accent-wine" /> для всех
            </label>
          ) : null}
          <button className="btn btn-dark btn-sm" disabled={pending}>
            Сохранить
          </button>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setOpen(false)} aria-label="Отмена">
            <X className="size-4" aria-hidden />
          </button>
        </form>
      ) : null}
    </div>
  );
}
