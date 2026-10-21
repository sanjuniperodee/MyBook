"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Copy, LoaderCircle, MessageSquareQuote, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { ask, toast } from "@/components/ui/overlays";
import { deleteMyTemplateAction, duplicateTemplateAction, reorderMyTemplatesAction } from "./actions";
import { TemplateEditor, type Tpl } from "./TemplateEditor";

/** Личные шаблоны: карточки с поиском, порядок, копия, правка в окне с предпросмотром. Общие — только для чтения и копирования. */
export function TemplatesManager({ mine, shared, manager }: { mine: Tpl[]; shared: Tpl[]; manager: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Tpl | "new" | null>(null);
  const [busy, start] = useTransition();

  const match = (t: Tpl) => !q.trim() || `${t.title} ${t.text}`.toLowerCase().includes(q.trim().toLowerCase());
  const myShown = useMemo(() => mine.filter(match), [mine, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const sharedShown = useMemo(() => shared.filter(match), [shared, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = (job: () => Promise<{ error?: string } | void>, ok?: string) =>
    start(async () => {
      const r = await job();
      if (r && r.error) return toast(r.error, "error");
      if (ok) toast(ok, "success");
      router.refresh();
    });

  const remove = async (t: Tpl) => {
    if (!(await ask(`Удалить шаблон «${t.title}»?`, true))) return;
    run(() => deleteMyTemplateAction(t.id), "Шаблон удалён");
  };

  const move = (i: number, dir: -1 | 1) => {
    const ids = mine.map((t) => t.id);
    [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    run(() => reorderMyTemplatesAction(ids));
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по названию и тексту" className="h-10 w-full rounded-full border border-line bg-white pr-4 pl-10 text-sm outline-none transition placeholder:text-muted focus:border-wine/40 focus:ring-2 focus:ring-wine/15" />
        </div>
        <button type="button" className="btn btn-primary btn-sm ml-auto" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> Новый шаблон
        </button>
      </div>

      <section aria-label="Мои шаблоны" className="space-y-3">
        <h2 className="flex items-center gap-2 text-[11px] font-semibold tracking-wider text-muted uppercase">
          Мои шаблоны <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] tracking-normal text-ink-soft tabular-nums normal-case">{mine.length}</span>
          {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
        </h2>
        {mine.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line bg-white px-6 py-12 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-rose text-wine">
              <MessageSquareQuote className="size-6" />
            </span>
            <div>
              <p className="font-medium">Здесь будут ваши быстрые ответы</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted">Приветствие, реквизиты доставки, «как оплатить» — один раз написали, дальше вставляете в чат одним нажатием. Можно также выбрать сообщения в чате и нажать «В шаблон».</p>
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing("new")}>
              <Plus className="size-4" /> Создать первый шаблон
            </button>
          </div>
        ) : myShown.length === 0 ? (
          <p className="rounded-2xl border border-line bg-white px-5 py-8 text-center text-sm text-muted">По запросу ничего не нашлось</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {myShown.map((t) => {
              const i = mine.findIndex((x) => x.id === t.id);
              return (
                <li key={t.id} className="group flex flex-col rounded-2xl border border-line bg-white p-4 shadow-soft transition hover:border-wine/30">
                  <div className="flex items-start gap-2">
                    <h3 className="min-w-0 flex-1 truncate font-semibold">{t.title}</h3>
                    {!q.trim() ? (
                      <div className="flex shrink-0 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                        <button type="button" disabled={i === 0 || busy} onClick={() => move(i, -1)} className="rounded-full p-1.5 text-muted hover:bg-cream hover:text-ink disabled:opacity-30" aria-label="Выше" title="Выше в списке">
                          <ArrowUp className="size-4" />
                        </button>
                        <button type="button" disabled={i === mine.length - 1 || busy} onClick={() => move(i, 1)} className="rounded-full p-1.5 text-muted hover:bg-cream hover:text-ink disabled:opacity-30" aria-label="Ниже" title="Ниже в списке">
                          <ArrowDown className="size-4" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <p className="mt-2 line-clamp-4 flex-1 text-sm leading-relaxed whitespace-pre-wrap text-ink-soft">{t.text}</p>
                  <div className="mt-3 flex items-center gap-1 border-t border-line pt-2.5">
                    <button type="button" className="btn btn-ghost btn-sm !h-8 !px-3" onClick={() => setEditing(t)}>
                      <Pencil className="size-3.5" /> Изменить
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm !h-8 !px-3" disabled={busy} onClick={() => run(() => duplicateTemplateAction(t.id), "Копия создана")}>
                      <Copy className="size-3.5" /> Копия
                    </button>
                    <button type="button" className="ml-auto rounded-full p-2 text-muted transition hover:bg-red-50 hover:text-red-700" onClick={() => remove(t)} aria-label={`Удалить «${t.title}»`}>
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {shared.length ? (
        <section aria-label="Общие шаблоны" className="space-y-3">
          <h2 className="flex items-center gap-2 text-[11px] font-semibold tracking-wider text-muted uppercase">
            <Users className="size-3.5" /> Общие шаблоны компании
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {sharedShown.map((t) => (
              <li key={t.id} className="flex flex-col rounded-2xl border border-line bg-cream/40 p-4">
                <h3 className="truncate font-semibold">{t.title}</h3>
                <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed whitespace-pre-wrap text-ink-soft">{t.text}</p>
                <div className="mt-3 border-t border-line pt-2.5">
                  <button type="button" className="btn btn-ghost btn-sm !h-8 !px-3" disabled={busy} onClick={() => run(() => duplicateTemplateAction(t.id), "Копия создана в «Моих шаблонах»")}>
                    <Copy className="size-3.5" /> Скопировать себе
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {editing ? (
        <TemplateEditor
          key={editing === "new" ? "new" : editing.id}
          tpl={editing === "new" ? null : editing}
          manager={manager}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
