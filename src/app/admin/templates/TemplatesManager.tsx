"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronLeft, Copy, LoaderCircle, MessageSquareQuote, Plus, Search, Trash2, Users } from "lucide-react";
import { ask, toast } from "@/components/ui/overlays";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/class-names";
import { deleteMyTemplateAction, duplicateTemplateAction, reorderMyTemplatesAction } from "./actions";
import { TemplateForm, type Tpl } from "./TemplateEditor";

/** Текст шаблона с подсвеченными подстановками {имя}, {ссылка}: видно, что CRM подставит сама. */
function Preview({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn("leading-relaxed whitespace-pre-line", className)}>
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

/** Иконка-действие в шапке панели: 44 px под палец, 32 — под курсор. */
const act = "btn btn-ghost btn-icon btn-sm size-11 sm:size-8";

type Selected = { kind: "new" } | { kind: "mine"; id: string } | { kind: "shared"; id: string } | null;

/**
 * «Мастер — деталь» (DESIGN.md §7.2): слева список — личные шаблоны (порядок — как в чате) и общие компании, справа —
 * редактор с предпросмотром «как увидит клиент». На телефоне — по очереди: список, нажатие открывает редактор на весь
 * экран, «Шаблоны» возвращает назад. Общие шаблоны только копируются себе. Смена шаблона при несохранённых правках —
 * с вопросом.
 */
export function TemplatesManager({ mine, shared, manager }: { mine: Tpl[]; shared: Tpl[]; manager: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Selected>(null);
  const [busy, start] = useTransition();
  const dirty = useRef(false);
  const onDirty = useCallback((d: boolean) => {
    dirty.current = d;
  }, []);

  const match = (t: Tpl) => !q.trim() || `${t.title} ${t.text}`.toLowerCase().includes(q.trim().toLowerCase());
  const myShown = useMemo(() => mine.filter(match), [mine, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const sharedShown = useMemo(() => shared.filter(match), [shared, q]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Перейти к другому шаблону; несохранённые правки — только с согласия. */
  const go = async (next: Selected) => {
    if (dirty.current && !(await ask("Закрыть без сохранения? Изменения пропадут.", true))) return;
    dirty.current = false;
    setSel(next);
  };

  const run = (job: () => Promise<{ error?: string } | void>, ok?: string) =>
    start(async () => {
      const r = await job();
      if (r && r.error) return toast(r.error, "error");
      if (ok) toast(ok, "success");
      router.refresh();
    });

  const remove = async (t: Tpl) => {
    if (!(await ask(`Удалить шаблон «${t.title}»?`, true))) return;
    dirty.current = false;
    setSel(null);
    run(() => deleteMyTemplateAction(t.id), "Шаблон удалён");
  };

  const move = (i: number, dir: -1 | 1) => {
    const ids = mine.map((t) => t.id);
    [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    run(() => reorderMyTemplatesAction(ids));
  };

  const current = sel?.kind === "mine" ? mine.find((t) => t.id === sel.id) : sel?.kind === "shared" ? shared.find((t) => t.id === sel.id) : undefined;
  const open = sel !== null && (sel.kind === "new" || !!current);
  const isSel = (kind: "mine" | "shared", id: string) => sel?.kind === kind && sel.id === id;
  const rowCls = (on: boolean) => cn("group flex w-full min-w-0 flex-col gap-0.5 px-4 py-2.5 text-left transition-colors hover:bg-sunken/60 max-lg:min-h-14", on && "bg-sunken shadow-[inset_3px_0_0_var(--color-wine)] hover:bg-sunken");

  return (
    <div className="panel overflow-hidden lg:grid lg:h-[calc(100dvh-var(--topbar-h)-9.5rem)] lg:min-h-[30rem] lg:grid-cols-[22rem_minmax(0,1fr)]" data-testid="templates">
      {/* Список */}
      <div className={cn("flex min-h-0 flex-col lg:border-r lg:border-line", open && "max-lg:hidden")}>
        <div className="flex shrink-0 items-center gap-2 border-b border-line p-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск шаблонов" aria-label="Поиск шаблонов" className="input pl-9" />
          </div>
          <button type="button" className="btn btn-primary shrink-0" onClick={() => void go({ kind: "new" })}>
            <Plus className="size-4" aria-hidden /> Новый
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <h2 className="sticky top-0 z-[1] flex items-center gap-2 border-b border-line bg-sunken/80 px-4 py-1.5 text-[13px] font-semibold text-ink-soft backdrop-blur-sm">
            Мои шаблоны <span className="count">{mine.length}</span>
            {busy ? <LoaderCircle className="ml-auto size-3.5 animate-spin text-muted" aria-label="Сохраняем" /> : null}
          </h2>
          {mine.length === 0 ? (
            <p className="px-4 py-5 text-sm text-muted">Пока пусто. Приветствие, реквизиты, «как оплатить» — один раз написали, дальше вставляете в чат одним нажатием.</p>
          ) : myShown.length === 0 ? (
            <p className="px-4 py-5 text-sm text-muted">По запросу ничего не нашлось: проверьте написание или поищите по словам из текста.</p>
          ) : (
            <ul className="divide-y divide-line">
              {myShown.map((t) => (
                <li key={t.id}>
                  <button type="button" className={rowCls(isSel("mine", t.id))} onClick={() => void go({ kind: "mine", id: t.id })} aria-current={isSel("mine", t.id) ? "true" : undefined}>
                    <span className="truncate text-sm font-medium">{t.title}</span>
                    <Preview text={t.text} className="line-clamp-1 text-[13px] text-muted" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {shared.length ? (
            <>
              <h2 className="sticky top-0 z-[1] flex items-center gap-2 border-y border-line bg-sunken/80 px-4 py-1.5 text-[13px] font-semibold text-ink-soft backdrop-blur-sm">
                <Users className="size-3.5 text-muted" aria-hidden /> Общие шаблоны компании <span className="count">{shared.length}</span>
              </h2>
              {sharedShown.length === 0 ? (
                <p className="px-4 py-5 text-sm text-muted">По запросу ничего не нашлось</p>
              ) : (
                <ul className="divide-y divide-line">
                  {sharedShown.map((t) => (
                    <li key={t.id}>
                      <button type="button" className={rowCls(isSel("shared", t.id))} onClick={() => void go({ kind: "shared", id: t.id })} aria-current={isSel("shared", t.id) ? "true" : undefined}>
                        <span className="truncate text-sm font-medium">{t.title}</span>
                        <Preview text={t.text} className="line-clamp-1 text-[13px] text-muted" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* Правая панель: редактор, просмотр общего шаблона или подсказка */}
      <div className={cn("flex min-h-0 min-w-0 flex-col", !open && "max-lg:hidden")}>
        {sel?.kind === "new" ? (
          <TemplateForm
            key="new"
            variant="pane"
            tpl={null}
            manager={manager}
            onClose={() => void go(null)}
            onDirtyChange={onDirty}
            onSaved={(id) => {
              dirty.current = false;
              setSel(id ? { kind: "mine", id } : null);
              router.refresh();
            }}
          />
        ) : sel?.kind === "mine" && current ? (
          (() => {
            const i = mine.findIndex((x) => x.id === current.id);
            return (
              <TemplateForm
                key={current.id}
                variant="pane"
                tpl={current}
                manager={manager}
                onClose={() => void go(null)}
                onDirtyChange={onDirty}
                onSaved={() => router.refresh()}
                headerActions={
                  <div className="flex items-center gap-0.5">
                    {!q.trim() ? (
                      <>
                        <button type="button" disabled={i === 0 || busy} onClick={() => move(i, -1)} className={act} aria-label="Выше" title="Выше в списке">
                          <ArrowUp className="size-4" />
                        </button>
                        <button type="button" disabled={i === mine.length - 1 || busy} onClick={() => move(i, 1)} className={act} aria-label="Ниже" title="Ниже в списке">
                          <ArrowDown className="size-4" />
                        </button>
                      </>
                    ) : null}
                    <button type="button" className={act} disabled={busy} onClick={() => run(() => duplicateTemplateAction(current.id), "Копия создана")} aria-label={`Копия «${current.title}»`} title="Сделать копию">
                      <Copy className="size-4" />
                    </button>
                    <button type="button" className={cn(act, "hover:bg-danger-bg hover:text-danger")} onClick={() => remove(current)} aria-label={`Удалить «${current.title}»`} title="Удалить">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                }
              />
            );
          })()
        ) : sel?.kind === "shared" && current ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-14 shrink-0 items-center gap-2 border-b border-line py-2 pr-3 pl-3 sm:pl-5">
              <button type="button" onClick={() => void go(null)} className="btn btn-ghost btn-sm -ml-1 px-2 text-wine lg:hidden" aria-label="К списку шаблонов">
                <ChevronLeft className="size-5" aria-hidden /> Шаблоны
              </button>
              <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold max-lg:sr-only">{current.title}</h2>
              <button type="button" className="btn btn-dark btn-sm" disabled={busy} onClick={() => run(() => duplicateTemplateAction(current.id), "Копия создана в «Моих шаблонах»")}>
                <Copy className="size-4" /> Скопировать себе
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
              <p className="text-xs text-muted">Общий шаблон компании: его ведёт руководитель в настройках CRM. Скопируйте себе, чтобы поправить под себя.</p>
              <h3 className="text-lg font-semibold">{current.title}</h3>
              <div className="max-w-xl rounded-[var(--r-panel)] border border-line bg-canvas p-4">
                <Preview text={current.text} className="text-[15px]" />
              </div>
            </div>
          </div>
        ) : mine.length === 0 && shared.length === 0 ? (
          <EmptyState
            icon={MessageSquareQuote}
            title="Здесь будут ваши быстрые ответы"
            action={
              <button type="button" className="btn btn-dark btn-sm" onClick={() => void go({ kind: "new" })}>
                <Plus className="size-4" /> Создать первый шаблон
              </button>
            }
            className="my-auto"
          >
            Приветствие, реквизиты доставки, «как оплатить» — один раз написали, дальше вставляете в чат одним нажатием. Можно также выбрать сообщения в чате и нажать «В шаблон».
          </EmptyState>
        ) : (
          <EmptyState
            icon={MessageSquareQuote}
            title="Выберите шаблон слева"
            action={
              <button type="button" className="btn btn-outline btn-sm" onClick={() => void go({ kind: "new" })}>
                <Plus className="size-4" /> Новый шаблон
              </button>
            }
            className="my-auto max-lg:hidden"
          >
            Здесь откроется редактор: текст, подстановки и то, как сообщение увидит клиент.
          </EmptyState>
        )}
      </div>
    </div>
  );
}
