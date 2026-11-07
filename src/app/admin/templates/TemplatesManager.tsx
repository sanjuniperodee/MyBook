"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Copy, LoaderCircle, MessageSquareQuote, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { ask, toast } from "@/components/ui/overlays";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/class-names";
import { deleteMyTemplateAction, duplicateTemplateAction, reorderMyTemplatesAction } from "./actions";
import { TemplateEditor, type Tpl } from "./TemplateEditor";

/** Текст шаблона с подсвеченными подстановками {имя}, {ссылка}: видно, что CRM подставит сама. */
function Preview({ text }: { text: string }) {
  return (
    <span className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed whitespace-pre-line text-muted">
      {text.split(/(\{[^{}\n]{1,40}\})/g).map((p, i) =>
        i % 2 === 1 ? (
          <span key={i} className="rounded bg-rose px-0.5 text-wine">
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </span>
  );
}

/** Иконка-действие в строке шаблона: 44 px под палец, 32 — под курсор. */
const act = "btn btn-ghost btn-icon btn-sm size-11 sm:size-8";

/**
 * Личные шаблоны — лист со строками: название и начало текста, нажатие открывает редактор с предпросмотром; справа —
 * порядок, копия, удаление. Общие шаблоны компании — вторым листом, только скопировать себе. Поиск — по обоим.
 */
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
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по названию и тексту" aria-label="Поиск шаблонов" className="input h-10 pl-9 text-sm" />
        </div>
        <button type="button" className="btn btn-primary btn-sm h-10 max-sm:w-full sm:ml-auto" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> Новый шаблон
        </button>
      </div>

      <Panel
        flush
        title={
          <>
            Мои шаблоны <span className="font-normal text-muted tabular-nums">{mine.length}</span>
          </>
        }
        description={mine.length > 1 && !q.trim() ? "Порядок здесь — порядок в списке шаблонов у поля ввода" : undefined}
        actions={busy ? <LoaderCircle className="size-4 animate-spin text-muted" aria-label="Сохраняем" /> : null}
      >
        {mine.length === 0 ? (
          <EmptyState
            icon={MessageSquareQuote}
            title="Здесь будут ваши быстрые ответы"
            action={
              <button type="button" className="btn btn-dark btn-sm" onClick={() => setEditing("new")}>
                <Plus className="size-4" /> Создать первый шаблон
              </button>
            }
          >
            Приветствие, реквизиты доставки, «как оплатить» — один раз написали, дальше вставляете в чат одним нажатием. Можно также выбрать сообщения в чате и нажать «В шаблон».
          </EmptyState>
        ) : myShown.length === 0 ? (
          <EmptyState compact icon={Search} title="По запросу ничего не нашлось">
            Проверьте написание или поищите по словам из текста.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {myShown.map((t) => {
              const i = mine.findIndex((x) => x.id === t.id);
              return (
                <li key={t.id} className="group flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-sunken/50 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                  <button type="button" onClick={() => setEditing(t)} className="min-w-0 flex-1 rounded-lg text-left" aria-label={`Изменить «${t.title}»`}>
                    <span className="block truncate text-sm font-medium">{t.title}</span>
                    <Preview text={t.text} />
                  </button>
                  <div className="-mx-2 flex shrink-0 items-center gap-0.5 sm:mx-0 sm:opacity-0 sm:transition-opacity sm:group-focus-within:opacity-100 sm:group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                    {!q.trim() ? (
                      <>
                        <button type="button" disabled={i === 0 || busy} onClick={() => move(i, -1)} className={act} aria-label="Выше" title="Выше в списке">
                          <ArrowUp className="size-4" />
                        </button>
                        <button type="button" disabled={i === mine.length - 1 || busy} onClick={() => move(i, 1)} className={act} aria-label="Ниже" title="Ниже в списке">
                          <ArrowDown className="size-4" />
                        </button>
                        <span className="mx-1 h-5 w-px bg-line max-sm:hidden" aria-hidden />
                      </>
                    ) : null}
                    <button type="button" className={cn(act, "max-sm:ml-auto")} onClick={() => setEditing(t)} aria-label={`Изменить «${t.title}»`} title="Изменить">
                      <Pencil className="size-4" />
                    </button>
                    <button type="button" className={act} disabled={busy} onClick={() => run(() => duplicateTemplateAction(t.id), "Копия создана")} aria-label={`Копия «${t.title}»`} title="Сделать копию">
                      <Copy className="size-4" />
                    </button>
                    <button type="button" className={cn(act, "hover:bg-danger-bg hover:text-danger")} onClick={() => remove(t)} aria-label={`Удалить «${t.title}»`} title="Удалить">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {shared.length ? (
        <Panel
          flush
          title={
            <span className="flex items-center gap-2">
              <Users className="size-4 text-muted" aria-hidden /> Общие шаблоны компании <span className="font-normal text-muted tabular-nums">{shared.length}</span>
            </span>
          }
          description="Их ведёт руководитель в настройках CRM. Скопируйте себе, чтобы поправить под себя."
        >
          {sharedShown.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-muted">По запросу ничего не нашлось</p>
          ) : (
            <ul className="divide-y divide-line">
              {sharedShown.map((t) => (
                <li key={t.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{t.title}</span>
                    <Preview text={t.text} />
                  </div>
                  <button type="button" className="btn btn-outline btn-sm shrink-0 self-start sm:self-center" disabled={busy} onClick={() => run(() => duplicateTemplateAction(t.id), "Копия создана в «Моих шаблонах»")}>
                    <Copy className="size-4" /> Скопировать себе
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
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
