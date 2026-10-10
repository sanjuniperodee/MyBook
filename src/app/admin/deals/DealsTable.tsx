"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bookmark, X } from "lucide-react";
import { ask, toast, toastError } from "@/components/ui/overlays";
import { bulkDealsAction, deleteViewAction, saveViewAction } from "./actions";
import { LostDialog } from "./DealsBoard";
import { cn } from "@/lib/utils";

export interface DealRow {
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
}: {
  rows: DealRow[];
  stages: { id: string; name: string; kind: string }[];
  staff: { id: string; label: string }[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lostFor, setLostFor] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const all = rows.length > 0 && selected.size === rows.length;
  const toggle = (id: string) => setSelected((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])));
  const run = (input: Parameters<typeof bulkDealsAction>[1]) =>
    start(async () => {
      try {
        const r = await bulkDealsAction([...selected], input);
        toast(r.skipped ? `Готово: ${r.done}, пропущено (нет доступа): ${r.skipped}` : `Готово: ${r.done}`);
        setSelected(new Set());
        router.refresh();
      } catch (e) {
        toastError(e);
      }
    });

  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white">
      {selected.size && canEdit ? (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-rose/40 px-4 py-2.5 text-sm" data-testid="bulk-bar">
          <span className="font-medium">Выбрано: {selected.size}</span>
          <select
            className="input h-8 w-48 text-sm"
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
            className="input h-8 w-48 text-sm"
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
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              const tag = new FormData(e.currentTarget).get("tag")?.toString().trim();
              if (tag) run({ op: "tag", tag });
              e.currentTarget.reset();
            }}
          >
            <input name="tag" maxLength={30} placeholder="тег" className="input h-8 w-28 text-sm" aria-label="Добавить тег" />
            <button className="btn btn-outline btn-sm h-8" disabled={pending}>
              + тег
            </button>
          </form>
          {canDelete ? (
            <button className="btn btn-ghost btn-sm h-8 text-red-700" disabled={pending} onClick={async () => (await ask(`Удалить ${selected.size} сделок? Задачи и история по ним тоже удалятся.`, true)) && run({ op: "delete" })}>
              Удалить
            </button>
          ) : null}
          <button className="ml-auto text-muted hover:text-ink" onClick={() => setSelected(new Set())} aria-label="Снять выделение">
            <X className="size-4" />
          </button>
        </div>
      ) : null}
      <table className="w-full min-w-[860px] text-sm">
        <thead className="border-b border-line text-left text-muted">
          <tr>
            {canEdit ? (
              <th className="w-10 px-4 py-3">
                <input type="checkbox" className="size-4 accent-wine" checked={all} onChange={() => setSelected(all ? new Set() : new Set(rows.map((r) => r.id)))} aria-label="Выбрать все" />
              </th>
            ) : null}
            <th className="px-4 py-3 font-medium">№</th>
            <th className="px-4 py-3 font-medium">Сделка</th>
            <th className="px-4 py-3 font-medium">Этап</th>
            <th className="px-4 py-3 font-medium">Канал</th>
            <th className="px-4 py-3 font-medium">Ответственный</th>
            <th className="px-4 py-3 text-right font-medium">Бюджет</th>
            <th className="px-4 py-3 font-medium">Создана</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.id} className={cn("hover:bg-cream/40", selected.has(r.id) && "bg-rose/20")}>
              {canEdit ? (
                <td className="px-4 py-2.5">
                  <input type="checkbox" className="size-4 accent-wine" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Выбрать сделку ${r.number}`} />
                </td>
              ) : null}
              <td className="px-4 py-2.5 font-medium">
                <Link href={`/admin/deals/${r.id}`} className="hover:text-wine">
                  {r.number}
                </Link>
              </td>
              <td className="max-w-72 truncate px-4 py-2.5">
                <Link href={`/admin/deals/${r.id}`} className="hover:text-wine">
                  {r.title}
                </Link>
                {r.contactName ? <span className="text-muted"> · {r.contactName}</span> : null}
              </td>
              <td className="px-4 py-2.5">
                <span className="rounded-full px-2 py-0.5 text-xs text-white" style={{ background: r.stage.color }}>
                  {r.stage.name}
                </span>
                {r.lostReason ? <span className="ml-1 text-xs text-muted">{r.lostReason}</span> : null}
              </td>
              <td className="px-4 py-2.5 text-muted">
                {r.channel}
                {r.campaign ? <span className="block text-[11px]">{r.campaign}</span> : null}
              </td>
              <td className="px-4 py-2.5">{r.assignee ?? <span className="text-muted">—</span>}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {r.amount}
                {r.paid ? <div className="text-[11px] text-emerald-700">получено {r.paid}</div> : null}
              </td>
              <td className="px-4 py-2.5 whitespace-nowrap text-muted">{r.created}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? <p className="p-6 text-center text-sm text-muted">Сделок не найдено.</p> : null}
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
    <div className="flex flex-wrap items-center gap-2" data-testid="saved-views">
      {views.map((v) => (
        <span key={v.id} className={cn("flex items-center gap-1 rounded-full border px-3 py-1 text-sm", v.query === query ? "border-wine bg-rose/40" : "border-line bg-white")}>
          <Link href={`/admin/deals${v.query ? `?${v.query}` : ""}`} className="hover:text-wine">
            {v.shared ? "👥 " : ""}
            {v.name}
          </Link>
          {v.mine ? (
            <button className="text-muted hover:text-red-700" disabled={pending} onClick={() => start(async () => void (await deleteViewAction(v.id), router.refresh()))} aria-label={`Удалить фильтр ${v.name}`}>
              <X className="size-3" />
            </button>
          ) : null}
        </span>
      ))}
      {query && !open ? (
        <button className="flex items-center gap-1 text-sm text-muted hover:text-wine" onClick={() => setOpen(true)}>
          <Bookmark className="size-3.5" /> Сохранить фильтр
        </button>
      ) : null}
      {open ? (
        <form
          className="flex items-center gap-2"
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
          <input name="name" autoFocus required maxLength={40} placeholder="Например, «Горящие к Новому году»" className="input h-8 w-64 text-sm" />
          {canShare ? (
            <label className="flex items-center gap-1 text-xs text-muted">
              <input type="checkbox" name="shared" className="accent-wine" /> для всех
            </label>
          ) : null}
          <button className="btn btn-sm h-8" disabled={pending}>
            Сохранить
          </button>
          <button type="button" className="text-muted" onClick={() => setOpen(false)} aria-label="Отмена">
            <X className="size-4" />
          </button>
        </form>
      ) : null}
    </div>
  );
}
