"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Copy, LoaderCircle, MessageSquareQuote, Pencil, Plus, Search, Trash2, Users, X } from "lucide-react";
import { ask, toast } from "@/components/ui/overlays";
import { fillTemplate } from "@/shared/domain/templates";
import { cn } from "@/lib/class-names";
import { deleteMyTemplateAction, duplicateTemplateAction, reorderMyTemplatesAction, saveMyTemplateAction } from "./actions";

interface Tpl {
  id: string;
  title: string;
  text: string;
}

/** Подстановки, которые CRM заполняет по диалогу, и пример значения для предпросмотра. */
const VARS: { key: string; hint: string }[] = [
  { key: "{имя}", hint: "Имя клиента" },
  { key: "{заказ}", hint: "Номер последнего заказа" },
  { key: "{ссылка}", hint: "Ссылка на заказ или книгу" },
  { key: "{менеджер}", hint: "Ваше имя" },
  { key: "{повод}", hint: "Повод из сделки" },
  { key: "{дата}", hint: "Дата события из сделки" },
  { key: "{получатель}", hint: "Кому дарят книгу" },
];

const SAMPLE = { name: "Айдана", order: 1042, link: "https://mybooks.kz/pay/…", occasion: "День рождения", date: "14 ноября", recipient: "маме" };

const previewText = (text: string, manager: string) => fillTemplate(text, { ...SAMPLE, manager });

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
        <Editor
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

/** Окно шаблона: название, текст со вставкой подстановок по клику и предпросмотр «как увидит клиент». */
function Editor({ tpl, manager, onClose, onSaved }: { tpl: Tpl | null; manager: string; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(tpl?.title ?? "");
  const [text, setText] = useState(tpl?.text ?? "");
  const [saving, start] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const insert = (v: string) => {
    const el = area.current;
    const a = el?.selectionStart ?? text.length;
    const b = el?.selectionEnd ?? text.length;
    setText((t) => t.slice(0, a) + v + t.slice(b));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(a + v.length, a + v.length);
    });
  };

  const valid = !!title.trim() && !!text.trim();
  const save = () =>
    valid &&
    start(async () => {
      const r = await saveMyTemplateAction(tpl?.id ?? "", title, text);
      if (r.error) return toast(r.error, "error");
      toast(tpl ? "Шаблон сохранён" : "Шаблон создан", "success");
      onSaved();
    });

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[92dvh] w-full max-w-3xl flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" role="dialog" aria-modal="true" aria-label={tpl ? "Изменить шаблон" : "Новый шаблон"}>
        <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
          <MessageSquareQuote className="size-5 text-wine" />
          <h2 className="flex-1 font-semibold">{tpl ? "Изменить шаблон" : "Новый шаблон"}</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-muted hover:bg-cream" aria-label="Закрыть">
            <X className="size-5" />
          </button>
        </div>
        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 md:grid-cols-[1fr_16rem]">
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 flex justify-between text-sm font-medium text-ink-soft">
                Название <span className="font-normal text-muted tabular-nums">{title.length}/60</span>
              </span>
              <input autoFocus={!tpl} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="Например, «Как оплатить»" className="input !h-11" />
            </label>
            <div>
              <span className="mb-1.5 flex justify-between text-sm font-medium text-ink-soft">
                Текст <span className="font-normal text-muted tabular-nums">{text.length}/2000</span>
              </span>
              <textarea
                ref={area}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && (e.preventDefault(), save())}
                maxLength={2000}
                rows={9}
                placeholder="Здравствуйте, {имя}! …"
                className="input fs-keep"
              />
              <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Подстановки">
                {VARS.map((v) => (
                  <button key={v.key} type="button" onClick={() => insert(v.key)} title={v.hint} className="rounded-full border border-line bg-cream/60 px-2.5 py-1 text-xs text-ink-soft transition hover:border-wine/40 hover:text-wine">
                    {v.key}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="min-w-0">
            <span className="mb-1.5 block text-sm font-medium text-ink-soft">Как увидит клиент</span>
            <div className="rounded-xl bg-[#f4efe7] p-3">
              {text.trim() ? (
                <div className={cn("ml-auto max-w-full rounded-2xl rounded-br-sm bg-[#f7e4e7] px-3 py-2 text-[13.5px] leading-snug break-words whitespace-pre-wrap text-ink shadow-sm")}>{previewText(text, manager)}</div>
              ) : (
                <p className="py-6 text-center text-xs text-muted">Начните писать — здесь появится сообщение</p>
              )}
            </div>
            <p className="mt-2 text-[11px] leading-snug text-muted">В примере подставлены условные данные. В чате вместо них будут имя клиента, номер заказа и ссылка из диалога.</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          <span className="mr-auto hidden text-[11px] text-muted sm:inline">Ctrl/⌘ + Enter — сохранить</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!valid || saving} onClick={save}>
            {saving ? <LoaderCircle className="size-4 animate-spin" /> : null} Сохранить
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
