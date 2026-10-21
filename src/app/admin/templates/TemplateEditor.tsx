"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Bold, Check, Italic, LoaderCircle, MessageSquareQuote, Sparkles, Strikethrough, X } from "lucide-react";
import { ask, toast } from "@/components/ui/overlays";
import { fillTemplate } from "@/shared/domain/templates";
import { titleFromText } from "@/modules/assistant/domain/templateDraft";
import { cn } from "@/lib/class-names";
import { saveMyTemplateAction } from "./actions";

export interface Tpl {
  id: string;
  title: string;
  text: string;
}

/** Подстановки: что CRM подставит из диалога. Подписи — человеческие, сама подстановка видна при наведении. */
const VARS: { key: string; label: string; hint: string }[] = [
  { key: "{имя}", label: "Имя клиента", hint: "Как клиент подписан в чате" },
  { key: "{заказ}", label: "Номер заказа", hint: "Последний заказ клиента" },
  { key: "{ссылка}", label: "Ссылка", hint: "На оплату или на книгу клиента" },
  { key: "{менеджер}", label: "Моё имя", hint: "Имя того, кто отвечает" },
  { key: "{повод}", label: "Повод", hint: "Поле сделки «Повод»" },
  { key: "{дата}", label: "Дата события", hint: "Поле сделки" },
  { key: "{получатель}", label: "Кому книга", hint: "Для кого заказана книга" },
];
const KNOWN = new Set(VARS.map((v) => v.key));

const EMOJI = ["😊", "👍", "🙏", "💛", "🎁", "📖", "✅", "📦", "🔥", "👋"];

/** Готовые заготовки для нового шаблона: нажал — получил текст, поправил под себя. */
const STARTERS: { title: string; text: string }[] = [
  { title: "Приветствие", text: "Здравствуйте, {имя}! 👋\nМеня зовут {менеджер}. Расскажите, для кого хотите книгу — подскажу лучший вариант." },
  { title: "Как оплатить", text: "{имя}, оплатить можно по ссылке:\n{ссылка}\nПосле оплаты пришлём подтверждение 🙂" },
  { title: "Сроки", text: "Печать и доставка занимают 5–7 рабочих дней после утверждения макета." },
  { title: "Спасибо за заказ", text: "Спасибо за заказ №{заказ}, {имя}! 💛\nКак только книга будет готова — сразу напишем." },
  { title: "Напоминание", text: "{имя}, добрый день! Подскажите, получилось ли посмотреть наше предложение? Если остались вопросы — с радостью отвечу 🙂" },
];

const SAMPLE = { name: "Айдана", order: 1042, link: "https://mybooks.kz/pay/…", occasion: "День рождения", date: "14 ноября", recipient: "маме" };

const VAR_RE = /(\{[^{}\n]{1,40}\})/g;

/** Подсветка подстановок под прозрачным полем ввода: известные — винные, незнакомые — жёлтые. */
function Backdrop({ text }: { text: string }) {
  return (
    <>
      {text.split(VAR_RE).map((p, i) =>
        i % 2 === 1 ? (
          <span key={i} className={cn("rounded-md", KNOWN.has(p) ? "bg-wine/15" : "bg-amber-200/70")}>
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
      {"​"}
    </>
  );
}

/** Разметка WhatsApp в тексте: *жирный*, _курсив_, ~зачёркнутый~ — как её увидит клиент. */
function Wa({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g).map((p, i) => {
        if (i % 2 === 0) return <span key={i}>{p}</span>;
        const inner = p.slice(1, -1);
        return p[0] === "*" ? <strong key={i}>{inner}</strong> : p[0] === "_" ? <em key={i}>{inner}</em> : <s key={i}>{inner}</s>;
      })}
    </>
  );
}

/** Название по умолчанию — первые слова текста: человеку не обязательно придумывать его самому. */
const suggest = (text: string) => (text.trim() ? titleFromText(text) : "");

/**
 * Окно шаблона. Слева — название и текст: подстановки подсвечиваются, кнопки вставляют их по клику, есть жирный/курсив
 * и смайлы; для нового шаблона — готовые заготовки. Справа — как увидит клиент (разметка и подстановки применены).
 */
export function TemplateEditor({ tpl, initial, notice, manager, onClose, onSaved }: { tpl: Tpl | null; /** Черновик для нового шаблона (например, из сообщения чата). */ initial?: { title: string; text: string }; /** Пояснение над формой: что и почему подставлено. */ notice?: React.ReactNode; manager: string; onClose: () => void; onSaved: () => void }) {
  const base = tpl ?? initial ?? { title: "", text: "" };
  const [title, setTitle] = useState(base.title);
  const [text, setText] = useState(base.text);
  const [saving, start] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);
  const back = useRef<HTMLDivElement>(null);

  const dirty = title !== base.title || text !== base.text;
  const autoTitle = suggest(text);
  const finalTitle = title.trim() || autoTitle;
  const valid = !!text.trim() && !!finalTitle;
  const unknown = useMemo(() => [...new Set((text.match(VAR_RE) ?? []).filter((v) => !KNOWN.has(v)))], [text]);

  const close = async () => {
    if (dirty && !(await ask("Закрыть без сохранения? Изменения пропадут.", true))) return;
    onClose();
  };
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && void closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Поле растёт вместе с текстом (подсветка лежит под ним и повторяет его размер).
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.max(176, el.scrollHeight)}px`;
  }, [text]);

  /** Заменить выделенное; selectInner — оставить выделенным вставленное (для обёрток *…*). */
  const edit = (fn: (sel: string) => { value: string; select?: boolean }) => {
    const el = area.current;
    const a = el?.selectionStart ?? text.length;
    const b = el?.selectionEnd ?? text.length;
    const r = fn(text.slice(a, b));
    setText((t) => t.slice(0, a) + r.value + t.slice(b));
    requestAnimationFrame(() => {
      el?.focus();
      if (r.select) el?.setSelectionRange(a, a + r.value.length);
      else el?.setSelectionRange(a + r.value.length, a + r.value.length);
    });
  };
  const insert = (v: string) => edit(() => ({ value: v }));
  const wrap = (mark: string) =>
    edit((sel) => {
      const body = sel || "текст";
      return { value: `${mark}${body}${mark}`, select: true };
    });

  const save = () =>
    valid &&
    start(async () => {
      const r = await saveMyTemplateAction(tpl?.id ?? "", finalTitle, text);
      if (r.error) return toast(r.error, "error");
      toast(tpl ? "Шаблон сохранён" : "Шаблон создан", "success");
      onSaved();
    });

  const preview = text.trim() ? fillTemplate(text, { ...SAMPLE, manager }) : "";

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4" onClick={(e) => e.target === e.currentTarget && void close()}>
      <div className="flex max-h-[94dvh] w-full max-w-4xl flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" role="dialog" aria-modal="true" aria-label={tpl ? "Изменить шаблон" : "Новый шаблон"}>
        <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
          <MessageSquareQuote className="size-5 text-wine" />
          <h2 className="flex-1 font-semibold">{tpl ? "Изменить шаблон" : "Новый шаблон"}</h2>
          <button type="button" onClick={() => void close()} className="rounded-full p-1 text-muted hover:bg-cream" aria-label="Закрыть">
            <X className="size-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto p-5 md:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="min-w-0 space-y-4">
            {notice}
            {!tpl && !text.trim() ? (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-ink-soft">
                  <Sparkles className="size-4 text-wine" /> Начать с готового
                </p>
                <div className="flex flex-wrap gap-2">
                  {STARTERS.map((s) => (
                    <button
                      key={s.title}
                      type="button"
                      onClick={() => {
                        setTitle(s.title);
                        setText(s.text);
                        requestAnimationFrame(() => area.current?.focus());
                      }}
                      className="rounded-full border border-line bg-cream/50 px-3.5 py-1.5 text-sm transition hover:border-wine/40 hover:bg-rose/50 hover:text-wine"
                    >
                      {s.title}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted">или просто напишите свой текст ниже</p>
              </div>
            ) : null}

            <label className="block">
              <span className="mb-1.5 flex justify-between text-sm font-medium text-ink-soft">
                Название <span className="font-normal text-muted tabular-nums">{title.length}/60</span>
              </span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder={autoTitle || "Например, «Как оплатить»"} className="input !h-11" />
              <span className="mt-1 block text-xs text-muted">По названию шаблон ищется в чате: наберите «/» и начало названия.{!title.trim() && autoTitle ? " Оставите пустым — возьмём первые слова текста." : ""}</span>
            </label>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-sm font-medium text-ink-soft">
                Текст сообщения <span className="font-normal text-muted tabular-nums">{text.length}/2000</span>
              </div>
              <div className="overflow-hidden rounded-xl border border-line bg-white transition focus-within:border-wine/50 focus-within:ring-4 focus-within:ring-wine/10">
                <div className="flex flex-wrap items-center gap-0.5 border-b border-line bg-cream/40 px-2 py-1.5" role="toolbar" aria-label="Оформление">
                  <ToolBtn label="Жирный (*текст*)" onClick={() => wrap("*")}>
                    <Bold className="size-4" />
                  </ToolBtn>
                  <ToolBtn label="Курсив (_текст_)" onClick={() => wrap("_")}>
                    <Italic className="size-4" />
                  </ToolBtn>
                  <ToolBtn label="Зачёркнутый (~текст~)" onClick={() => wrap("~")}>
                    <Strikethrough className="size-4" />
                  </ToolBtn>
                  <span className="mx-1.5 h-5 w-px bg-line" />
                  {EMOJI.map((e) => (
                    <button key={e} type="button" onClick={() => insert(e)} className="flex size-8 items-center justify-center rounded-lg text-base transition hover:bg-white" aria-label={`Вставить ${e}`}>
                      {e}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <div ref={back} aria-hidden className="pointer-events-none absolute inset-0 px-4 py-3 text-[15px] leading-relaxed break-words whitespace-pre-wrap text-transparent">
                    <Backdrop text={text} />
                  </div>
                  <textarea
                    ref={area}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") return e.preventDefault(), save();
                      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") return e.preventDefault(), wrap("*");
                      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") return e.preventDefault(), wrap("_");
                    }}
                    maxLength={2000}
                    autoFocus={!!tpl || !!initial}
                    placeholder="Здравствуйте, {имя}! …"
                    className="fs-keep relative block w-full resize-none overflow-hidden bg-transparent px-4 py-3 text-[15px] leading-relaxed outline-none placeholder:text-muted/70"
                  />
                </div>
              </div>
              {unknown.length ? <p className="mt-1.5 text-xs text-amber-700">Незнакомая подстановка {unknown.join(", ")} — она останется в тексте как есть, если это не своё поле сделки.</p> : null}
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium text-ink-soft">Подстановки — нажмите, чтобы вставить</p>
              <div className="flex flex-wrap gap-1.5">
                {VARS.map((v) => (
                  <button key={v.key} type="button" onClick={() => insert(v.key)} title={`${v.key} — ${v.hint}`} className="rounded-full border border-line bg-cream/60 px-3 py-1 text-xs text-ink-soft transition hover:border-wine/40 hover:bg-rose/50 hover:text-wine">
                    {v.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted">В чате CRM сама заменит их данными диалога.</p>
            </div>
          </div>

          <div className="min-w-0">
            <span className="mb-1.5 block text-sm font-medium text-ink-soft">Как увидит клиент</span>
            <div className="rounded-2xl bg-[#f4efe7] p-3 md:sticky md:top-0">
              {preview ? (
                <div className="ml-auto w-fit max-w-full rounded-2xl rounded-br-sm bg-[#f7e4e7] px-3 py-2 text-[13.5px] leading-snug break-words whitespace-pre-wrap text-ink shadow-sm">
                  <Wa text={preview} />
                  <span className="mt-1 flex items-center justify-end gap-1 text-[10.5px] text-muted">
                    12:30 <Check className="size-3" />
                  </span>
                </div>
              ) : (
                <p className="py-8 text-center text-xs text-muted">Начните писать — здесь появится сообщение</p>
              )}
              <p className="mt-3 text-[11px] leading-snug text-muted">Имя, заказ и ссылка в примере условные. *Жирный* и _курсив_ WhatsApp показывает у клиента именно так.</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          <span className="mr-auto hidden text-[11px] text-muted sm:inline">Ctrl/⌘+Enter — сохранить · Ctrl/⌘+B — жирный</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => void close()}>
            Отмена
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!valid || saving} onClick={save}>
            {saving ? <LoaderCircle className="size-4 animate-spin" /> : null} {tpl ? "Сохранить" : "Создать шаблон"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ToolBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className="flex size-8 items-center justify-center rounded-lg text-ink-soft transition hover:bg-white hover:text-ink">
      {children}
    </button>
  );
}
