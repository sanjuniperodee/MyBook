"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { toastError } from "@/components/ui/overlays";
import { cn } from "@/lib/class-names";
import { BOARD_COLORS, isBoardColor } from "@/shared/domain/boards";
import { boardsApi } from "./client";

type Template = { key: string; name: string; description: string; kind: string; color: string; columns: string[] };

/** «Создать доску»: шаблон (колонки, метки, правила), название, кто видит. Общие доски отделов — только с правом «Доски». */
export function NewBoard({ templates, canTeam }: { templates: Template[]; canTeam: boolean }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const list = templates.filter((t) => canTeam || t.kind !== "team");
  const [tpl, setTpl] = useState(list.find((t) => t.key === "project")?.key ?? list[0]?.key ?? "project");
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"all" | "members">("members");
  const [busy, setBusy] = useState(false);
  const current = list.find((t) => t.key === tpl);
  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const { id } = await boardsApi.create({ name, template: tpl, visibility: current?.kind === "team" ? "all" : current?.kind === "personal" ? "members" : visibility });
      router.push(`/admin/tasks/boards/${id}`);
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => ref.current?.showModal()}>
        <Plus className="size-4" aria-hidden /> Создать доску
      </button>
      <dialog ref={ref} onClick={(e) => e.target === ref.current && ref.current?.close()} className="m-auto w-full max-w-xl rounded-[var(--r-sheet)] border border-line bg-white p-0 text-ink shadow-lift backdrop:bg-ink/40 max-sm:mb-0 max-sm:rounded-b-none">
        <form
          className="flex flex-col gap-4 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="flex items-start justify-between">
            <h2 className="text-lg font-semibold">Новая доска</h2>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => ref.current?.close()} aria-label="Закрыть">
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="label mb-1">Шаблон</legend>
            {list.map((t) => (
              <label key={t.key} className={cn("flex cursor-pointer flex-col gap-1 rounded-[var(--r-ctl)] border p-3 text-[13px]", tpl === t.key ? "border-wine bg-rose/40" : "border-line hover:border-line-strong")}>
                <span className="flex items-center gap-2 font-semibold">
                  <input type="radio" name="tpl" value={t.key} checked={tpl === t.key} onChange={() => setTpl(t.key)} className="sr-only" />
                  <span className="size-2.5 rounded-[3px]" style={{ background: isBoardColor(t.color) ? BOARD_COLORS[t.color] : BOARD_COLORS.slate }} aria-hidden />
                  {t.name}
                </span>
                <span className="text-xs text-muted">{t.columns.join(" → ")}</span>
              </label>
            ))}
          </fieldset>
          {current ? <p className="-mt-2 text-xs text-muted">{current.description}</p> : null}
          <label className="flex flex-col gap-1">
            <span className="label">Название</span>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={current?.kind === "personal" ? "Мои дела" : "Например, «Запуск рекламы к Наурызу»"} className="input" required />
          </label>
          {current?.kind === "project" ? (
            <label className="flex flex-col gap-1">
              <span className="label">Кто видит</span>
              <select value={visibility} onChange={(e) => setVisibility(e.target.value as "all" | "members")} className="input">
                <option value="members">Только участники (вы добавите их в настройках)</option>
                <option value="all">Все сотрудники</option>
              </select>
            </label>
          ) : null}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => ref.current?.close()}>
              Отмена
            </button>
            <button className="btn btn-dark" disabled={!name.trim() || busy}>
              Создать
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
