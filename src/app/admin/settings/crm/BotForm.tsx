"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Bot, Plus, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import { cn } from "@/lib/class-names";
import { saveBotAction } from "./actions";
import { BotTester } from "./BotTester";
import type { BotChannel, BotConfig, BotLang, BotTextKey, FaqIntent } from "@/modules/messaging/domain/botConfig";

type Mode = "off" | "fallback" | "off_hours" | "always";
export interface BotFormField {
  key: string;
  label: string;
  type: string;
  options: string[];
}

const MODES: [Mode, string, string][] = [
  ["off", "Выключен", ""],
  ["always", "Всегда сразу", "По умолчанию. Бот отвечает на каждое новое обращение после короткой паузы и замолкает, как только напишет человек."],
  ["fallback", "Если менеджер не ответил", "В рабочее время бот ждёт ответа человека N минут, ночью отвечает сразу."],
  ["off_hours", "Только вне рабочего времени", "Днём пишут менеджеры, ночью и в выходные — бот."],
];
const CHANNELS: [BotChannel, string][] = [
  ["whatsapp", "WhatsApp"],
  ["site", "Чат на сайте"],
  ["instagram", "Instagram"],
  ["telegram", "Telegram"],
];
const FAQ: [FaqIntent, string][] = [
  ["price", "Цена"],
  ["how", "Как это работает"],
  ["timing", "Сроки"],
  ["delivery", "Доставка"],
  ["payment", "Оплата"],
  ["examples", "Примеры"],
  ["language", "Язык книги"],
];
const MAIN_TEXTS: [BotTextKey, string][] = [
  ["greeting", "Приветствие ({имя} — имя клиента)"],
  ["finish", "Конец опроса в рабочее время"],
  ["finishLater", "Конец опроса ночью ({когда} — «завтра с 09:00»)"],
  ["handoff", "Клиент просит позвонить или позвать менеджера"],
  ["handoffLater", "То же ночью ({когда})"],
];
const OTHER_TEXTS: [BotTextKey, string][] = [
  ["voice", "На голосовое"],
  ["media", "На фото или файл"],
  ["reask", "Не понял ответ (дальше — вопрос ещё раз)"],
  ["noted", "Понял несколько ответов сразу ({что})"],
  ["repeat", "Тот же вопрос клиента второй раз"],
  ["decline", "Клиенту не интересно"],
  ["linkExample", "Ссылка на пример книги ({ссылка})"],
  ["linkStart", "Ссылка, чтобы начать книгу ({ссылка})"],
];

const area = "w-full rounded-xl border border-line bg-[#fbf9f5] px-3 py-2 text-sm";

export function BotForm({
  mode: initialMode,
  config,
  fields,
  defaults,
  vars,
  autoReplyRules,
  aiModel,
  stats,
}: {
  mode: string;
  config: BotConfig;
  fields: BotFormField[];
  /** Заводские тексты и подписи — плейсхолдеры пустых полей. */
  defaults: { texts: BotConfig["texts"]; faq: BotConfig["faq"]; optionLabels: Record<string, string> };
  /** Переменные для ответов с текущими значениями из «Цен и тарифов». */
  vars: { key: string; label: string; value: string }[];
  /** Включённые правила «входящее → сообщение клиенту» (автоответ): пока бот ведёт диалог, они молчат. */
  autoReplyRules: string[];
  /** Модель AI-помощника; null — AI не настроен. */
  aiModel: string | null;
  stats: React.ReactNode;
}) {
  const [mode, setMode] = useState<Mode>((["off", "fallback", "off_hours", "always"] as const).find((m) => m === initialMode) ?? "off");
  const [cfg, setCfg] = useState<BotConfig>({ ...config, questions: config.questions.filter((q) => fields.some((f) => f.key === q.field)) });
  const [lang, setLang] = useState<BotLang>("ru");
  const [pending, start] = useTransition();
  const patch = (p: Partial<BotConfig>) => setCfg((c) => ({ ...c, ...p }));
  const setText = (key: BotTextKey, value: string) => setCfg((c) => ({ ...c, texts: { ...c.texts, [lang]: { ...c.texts[lang], [key]: value } } }));
  const setQuestion = (i: number, p: { field?: string; text?: string }) =>
    setCfg((c) => ({ ...c, questions: c.questions.map((q, j) => (j === i ? { field: p.field ?? q.field, text: p.text === undefined ? q.text : { ...q.text, [lang]: p.text } } : q)) }));
  const move = (i: number, d: -1 | 1) =>
    setCfg((c) => {
      const n = [...c.questions];
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return { ...c, questions: n };
    });
  const textField = (key: BotTextKey, label: string) => (
    <label key={`${lang}-${key}`} className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <textarea value={cfg.texts[lang][key]} placeholder={defaults.texts[lang][key]} onChange={(e) => setText(key, e.target.value)} rows={2} maxLength={500} className={area} />
    </label>
  );

  return (
    <section className="space-y-5 rounded-2xl border border-line bg-white p-5" data-testid="bot-form">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Bot className="size-5 text-wine" /> Бот-автоответчик
        </h2>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs", mode === "off" ? "bg-cream text-muted" : "bg-emerald-100 text-emerald-800")}>{mode === "off" ? "выключен" : "включён"}</span>
      </div>
      <p className="text-sm text-muted">
        На первое сообщение нового клиента бот здоровается, отвечает на частые вопросы (цена, доставка, сроки) и спрашивает недостающее — ответы записывает в поля сделки. Понимает русский и казахский
        и отвечает на языке клиента. Замолкает, как только ответит человек — из CRM или с телефона. Не пишет клиентам с заказом, книгой или сделкой в работе и тем, с кем переписка была до CRM.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {MODES.map(([v, label, hint]) => (
          <label key={v} className={cn("flex cursor-pointer gap-2 rounded-xl border px-3 py-2 text-sm", mode === v ? "border-wine/40 bg-rose/30" : "border-line")}>
            <input type="radio" checked={mode === v} onChange={() => setMode(v)} className="mt-0.5 accent-wine" />
            <span>
              {label}
              {hint ? <span className="mt-0.5 block text-xs text-muted">{hint}</span> : null}
            </span>
          </label>
        ))}
      </div>
      {mode === "fallback" ? (
        <label className="flex items-center gap-2 text-sm">
          Ждать ответа менеджера
          <input type="number" min={1} max={120} value={cfg.waitMinutes} onChange={(e) => patch({ waitMinutes: Math.max(1, Math.min(120, Number(e.target.value) || 1)) })} className="input h-9 w-20 text-sm" />
          минут
        </label>
      ) : null}

      <fieldset>
        <legend className="mb-1.5 text-xs text-muted">Где работает бот (в почте — никогда)</legend>
        <div className="flex flex-wrap gap-2 text-sm">
          {CHANNELS.map(([v, label]) => (
            <label key={v} className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5">
              <input type="checkbox" className="accent-wine" checked={cfg.channels.includes(v)} onChange={(e) => patch({ channels: e.target.checked ? [...cfg.channels, v] : cfg.channels.filter((c) => c !== v) })} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {autoReplyRules.length ? (
        <p className="flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="size-4 shrink-0" />
          Включены правила-автоответы: {autoReplyRules.map((r) => `«${r}»`).join(", ")}. Пока бот ведёт диалог, они клиенту не пишут — двух автоответов подряд не будет.
        </p>
      ) : null}

      <div className="flex gap-1 border-b border-line" role="tablist">
        {(["ru", "kk"] as const).map((l) => (
          <button key={l} type="button" role="tab" aria-selected={lang === l} onClick={() => setLang(l)} className={cn("-mb-px border-b-2 px-3 py-1.5 text-sm", lang === l ? "border-wine font-medium text-wine" : "border-transparent text-muted")}>
            {l === "ru" ? "Русский" : "Қазақша"}
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-muted">Пустое поле — заводской текст. Казахский увидят клиенты, которые пишут по-казахски.</span>
      </div>

      {textField("greeting", MAIN_TEXTS[0][1])}

      <div className="space-y-2">
        <span className="block text-xs text-muted">Вопросы — по очереди, только то, чего ещё нет в сделке. Что клиент уже написал сам («маме на юбилей 15 ноября»), бот не спрашивает.</span>
        {cfg.questions.map((q, i) => {
          const f = fields.find((x) => x.key === q.field);
          return (
            <div key={i} className="space-y-2 rounded-xl border border-line p-2.5">
              <div className="flex flex-wrap items-start gap-2">
                <span className="mt-2 w-5 text-center text-xs text-muted">{i + 1}</span>
                <textarea
                  value={q.text[lang]}
                  placeholder={lang === "kk" ? "Пусто — заводской перевод или русский текст" : ""}
                  onChange={(e) => setQuestion(i, { text: e.target.value })}
                  rows={1}
                  maxLength={400}
                  className="min-h-9 flex-1 resize-y rounded-lg border border-line px-2.5 py-1.5 text-sm field-sizing-content"
                  aria-label={`Вопрос ${i + 1}`}
                />
                <select value={q.field} onChange={(e) => setQuestion(i, { field: e.target.value })} className="input h-9 w-44 text-sm" aria-label={`Поле для ответа ${i + 1}`}>
                  {fields.map((x) => (
                    <option key={x.key} value={x.key}>
                      → {x.label}
                    </option>
                  ))}
                </select>
                <div className="flex">
                  <button type="button" className="btn btn-ghost btn-sm size-9 px-0" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Выше">
                    <ArrowUp className="size-4" />
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm size-9 px-0" disabled={i === cfg.questions.length - 1} onClick={() => move(i, 1)} aria-label="Ниже">
                    <ArrowDown className="size-4" />
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm size-9 px-0 text-red-700" onClick={() => patch({ questions: cfg.questions.filter((_, j) => j !== i) })} aria-label="Удалить вопрос">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
              {f?.type === "select" && lang === "kk" ? (
                <div className="ml-7 grid gap-1.5 sm:grid-cols-2">
                  {f.options.map((o) => (
                    <label key={o} className="flex items-center gap-2 text-xs">
                      <span className="w-32 shrink-0 truncate text-muted" title={o}>
                        {o}
                      </span>
                      <input
                        value={cfg.optionLabels[o] ?? ""}
                        placeholder={defaults.optionLabels[o] ?? o}
                        onChange={(e) => patch({ optionLabels: { ...cfg.optionLabels, [o]: e.target.value } })}
                        maxLength={100}
                        className="input h-8 flex-1 text-xs"
                        aria-label={`Вариант «${o}» по-казахски`}
                      />
                    </label>
                  ))}
                </div>
              ) : null}
              {f && (f.key === "recipient" || /для\s+кого|кому/i.test(f.label)) && f.type !== "select" ? (
                <p className="ml-7 text-xs text-muted">Бот покажет варианты: любимому, маме, папе, другу — и «о себе (автобиография)», «своя книга с нуля», когда эти режимы есть на сайте. Тема пишется меткой сделки.</p>
              ) : null}
            </div>
          );
        })}
        {cfg.questions.length < 6 && fields.length ? (
          <button type="button" className="flex items-center gap-1.5 text-sm text-wine hover:underline" onClick={() => patch({ questions: [...cfg.questions, { field: fields[0].key, text: { ru: "", kk: "" } }] })}>
            <Plus className="size-4" /> Вопрос
          </button>
        ) : null}
        {!fields.length ? <p className="text-sm text-muted">Сначала создайте поля сделки в разделе «Свои поля» — в них бот будет записывать ответы.</p> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">{MAIN_TEXTS.slice(1).map(([k, label]) => textField(k, label))}</div>

      <details className="rounded-xl border border-line p-3">
        <summary className="cursor-pointer text-sm">Другие тексты бота</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">{OTHER_TEXTS.map(([k, label]) => textField(k, label))}</div>
      </details>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-medium">Ответы на частые вопросы</h3>
          <p className="mt-0.5 text-xs text-muted">
            Каждый — один раз за диалог, дальше бот задаёт свой вопрос. Цифры — только переменными, тогда они не разойдутся с «Ценами и тарифами»: {vars.map((v) => `${v.key} = ${v.value || "—"}`).join(", ")}.
            Выключенный ответ бот не даёт — на вопрос ответит менеджер.
          </p>
        </div>
        {FAQ.map(([intent, label]) => (
          <div key={intent} className="rounded-xl border border-line p-2.5">
            <label className="mb-1.5 flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-wine" checked={cfg.faq[intent].on} onChange={(e) => patch({ faq: { ...cfg.faq, [intent]: { ...cfg.faq[intent], on: e.target.checked } } })} />
              {label}
            </label>
            {cfg.faq[intent].on ? (
              <textarea
                value={cfg.faq[intent].text[lang]}
                placeholder={defaults.faq[intent].text[lang]}
                onChange={(e) => patch({ faq: { ...cfg.faq, [intent]: { ...cfg.faq[intent], text: { ...cfg.faq[intent].text, [lang]: e.target.value } } } })}
                rows={2}
                maxLength={1000}
                className={area}
                aria-label={`Ответ: ${label}`}
              />
            ) : null}
          </div>
        ))}
        <p className="rounded-xl bg-cream/50 px-3 py-2 text-xs text-ink-soft">
          Цену бот называет «от» — по «Ценам и тарифам» ({"{цена.электронная}"}, {"{цена.печатная}"}), и добавляет строку акции. Точную сумму со скидкой называет менеджер. Скрытый тариф бот не называет: строка с пустой
          переменной не отправляется.
        </p>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">
            Акция ({"{акция}"}) — добавляется к ответу о цене. Проценты и сроки можно, суммы в тенге — нет. Пусто — бот про акции не говорит{lang === "kk" ? "; пустая казахская — клиент увидит русскую" : ""}
          </span>
          <input
            value={cfg.promo[lang]}
            placeholder={lang === "kk" ? "Мысалы: бүгін күн соңына дейін 25% жеңілдік" : "Например: сегодня до конца дня скидка 25%"}
            onChange={(e) => patch({ promo: { ...cfg.promo, [lang]: e.target.value } })}
            maxLength={300}
            className="input h-9 w-full text-sm"
            aria-label="Акция"
          />
        </label>
      </div>

      <div className="space-y-2 text-sm">
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-0.5 accent-wine" checked={cfg.sendLink} onChange={(e) => patch({ sendLink: e.target.checked })} />
          <span>
            Ссылка после ответа «для кого»
            <span className="block text-xs text-muted">
              Регистрация открыта — ссылка, чтобы начать книгу этой темы; закрыта — страница-пример нужного вида книги (/kniga/…), а доступ в кабинет откроет менеджер или оплаченный счёт из чата; у клиента с
              аккаунтом — новая книга в кабинете.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-0.5 accent-wine" checked={cfg.ai} disabled={!aiModel} onChange={(e) => patch({ ai: e.target.checked })} />
          <span>
            AI помогает понять ответ, если бот не понял сам
            <span className="block text-xs text-muted">
              {aiModel
                ? `Модель: ${aiModel}. Только разбор ответа (до 6 секунд) — тексты клиенту всегда из настроек, цены AI не называет.${/free/i.test(aiModel) ? " Бесплатная модель OpenRouter бывает недоступна — для бота выберите конкретную модель в «Интеграциях»." : ""}`
                : "AI-помощник не настроен — подключите его в разделе «AI-помощник» выше."}
            </span>
          </span>
        </label>
      </div>

      <button
        className="btn btn-sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await saveBotAction({ mode, ...cfg });
            toast(r.error ?? r.ok ?? "Сохранено", r.error ? "error" : "success");
          })
        }
      >
        Сохранить бота
      </button>

      {stats}

      <BotTester config={cfg} />
    </section>
  );
}
