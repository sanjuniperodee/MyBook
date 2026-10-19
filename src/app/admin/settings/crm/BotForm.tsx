"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Bot, Plus, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import { cn } from "@/lib/class-names";
import { saveBotAction } from "./actions";
import { BotTester } from "./BotTester";
import type { BotFormTab } from "./botTabs";
import { DEFAULT_SELL_FACTS, revoiceConfig, type BotChannel, type BotConfig, type BotLang, type BotTextKey, type FaqIntent } from "@/modules/messaging/domain/botConfig";

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

const SELL_TEXTS: [BotTextKey, string][] = [
  ["offer", "Предложение: чем ценна книга"],
  ["offerPrice", "Цена и предоплата ({цена.печатная}, {акция}, {предоплата}); строка с пустой переменной не отправляется"],
  ["deadlineOk", "Успеваем к дате ({дата}, {заполнить_до} — до какого дня дописать)"],
  ["deadlineExpress", "Успеваем только с экспресс-печатью"],
  ["deadlineLate", "К дате печатную не успеть"],
  ["close", "Призыв оформить"],
  ["closeShort", "«Оформляем?» после ответа на вопрос"],
  ["invoiceSent", "Бот выставил счёт (дальше — сообщение со ссылкой на оплату)"],
  ["agreed", "Клиент согласен, счёт пришлёт менеджер"],
  ["agreedLater", "То же ночью ({когда})"],
  ["objPrice", "«Дорого», «денег нет»"],
  ["objLater", "«Подумаю», «завтра», «после зарплаты»"],
  ["followUp", "Напоминание, если клиент молчит"],
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
  seller,
  stats,
  coach,
  materials,
  initialTab = "mode",
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
  /** Модель AI-продажника («Интеграции» → AI); null — не подключена: продажник работает по шаблонам. */
  seller: string | null;
  stats: React.ReactNode;
  /** Работа над ошибками AI-продажника (уроки и журнал разборов). */
  coach?: React.ReactNode;
  /** Подборка материалов продажника (фото, видео, пример книги). */
  materials?: React.ReactNode;
  /** Раздел, который открыт сразу (из адреса ?section=…). */
  initialTab?: BotFormTab;
}) {
  const [tab, setTab] = useState<BotFormTab>(initialTab);
  const [mode, setMode] = useState<Mode>((["off", "fallback", "off_hours", "always"] as const).find((m) => m === initialMode) ?? "off");
  // Тексты и ответы — голосом того, от чьего имени пишет бот: заводские тексты другого голоса заменены (см. revoiceConfig).
  const [cfg, setCfg] = useState<BotConfig>(() => revoiceConfig({ ...config, questions: config.questions.filter((q) => fields.some((f) => f.key === q.field)) }, config.sell.speaksAs));
  const [lang, setLang] = useState<BotLang>("ru");
  const [pending, start] = useTransition();
  const patch = (p: Partial<BotConfig>) => setCfg((c) => ({ ...c, ...p }));
  const setSell = (p: Partial<BotConfig["sell"]>) => setCfg((c) => ({ ...c, sell: { ...c.sell, ...p } }));
  const sellNumber = (key: "prepay" | "writeDays" | "deliveryDays" | "followUpHours" | "productionDays", label: string, min: number, max: number) => (
    <label key={key} className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <input type="number" min={min} max={max} value={cfg.sell[key]} onChange={(e) => setSell({ [key]: Math.max(min, Math.min(max, Math.floor(Number(e.target.value) || 0))) })} className="input h-9 w-full text-sm" aria-label={label} />
    </label>
  );
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

      <div className="flex flex-wrap gap-1 border-b border-line" role="tablist" aria-label="Разделы настройки бота">
        {(
          [
            ["mode", "Когда работает"],
            ["qualifier", "Опрос и ответы"],
            ["sell", cfg.sell.on ? "Продажи ✓" : "Продажи"],
            ["test", "Проверка и статистика"],
          ] as const
        ).map(([v, label]) => (
          <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => setTab(v)} className={cn("-mb-px border-b-2 px-3 py-2 text-sm", tab === v ? "border-wine font-medium text-wine" : "border-transparent text-muted hover:text-ink")}>
            {label}
          </button>
        ))}
      </div>

      {tab === "mode" ? (
        <>
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

        </>
      ) : null}

      {tab === "qualifier" || tab === "sell" ? (
      <div className="flex gap-1 border-b border-line" role="tablist">
        {(["ru", "kk"] as const).map((l) => (
          <button key={l} type="button" role="tab" aria-selected={lang === l} onClick={() => setLang(l)} className={cn("-mb-px border-b-2 px-3 py-1.5 text-sm", lang === l ? "border-wine font-medium text-wine" : "border-transparent text-muted")}>
            {l === "ru" ? "Русский" : "Қазақша"}
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-muted">Пустое поле — заводской текст. Казахский увидят клиенты, которые пишут по-казахски.</span>
      </div>

      ) : null}

      {tab === "qualifier" ? (
        <>
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

        </>
      ) : null}

      {tab === "sell" ? (
        <div className="space-y-4" data-testid="bot-sell">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 accent-wine" checked={cfg.sell.on} onChange={(e) => setSell({ on: e.target.checked })} aria-label="Бот продаёт" />
            <span>
              <span className="font-medium">Бот продаёт</span>
              <span className="block text-xs text-muted">
                Вместо «передала менеджеру» бот ведёт клиента к покупке: чем ценна книга, цена «от» и предоплата, успеем ли к дате, «Оформляем?», ответы на «дорого» и «подумаю», напоминание, а на «да» — счёт.
                Выключено — бот только собирает ответы (шаблоны на вкладке «Опрос и ответы»).
              </span>
            </span>
          </label>
          {cfg.sell.on ? (
            <>
              <fieldset className="space-y-2">
                <legend className="mb-1 text-xs text-muted">Кто ведёт продающую беседу</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ["ai", "AI-продажник", "Модель сама понимает клиента (русский, казахский, смесь, опечатки), отвечает на любые вопросы, снимает возражения и ведёт к оплате. Цены, сроки, проценты, ссылки и счёт проверяет код: выдумать цену или скидку модель не может."],
                      ["template", "По шаблонам", "Бот отвечает заготовленными текстами по сценарию: предложение → возражение → «да». Предсказуемо, но не понимает свободную речь. Обычный бот-квалификатор всегда работает по шаблонам."],
                    ] as const
                  ).map(([v, label, hint]) => (
                    <label key={v} className={cn("flex cursor-pointer gap-2 rounded-xl border px-3 py-2 text-sm", cfg.sell.engine === v ? "border-wine/40 bg-rose/30" : "border-line")}>
                      <input type="radio" name="sell-engine" checked={cfg.sell.engine === v} onChange={() => setSell({ engine: v })} className="mt-0.5 accent-wine" />
                      <span>
                        {label}
                        <span className="mt-0.5 block text-xs text-muted">{hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {cfg.sell.engine === "ai" ? (
                  seller ? (
                    <p className={cn("rounded-xl px-3 py-2 text-xs", /free/i.test(seller) ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900")}>
                      Модель продажника: <b>{seller}</b>.{" "}
                      {/free/i.test(seller) ? "Бесплатные модели OpenRouter нестабильны и хуже держат правила — для продаж выберите сильную модель (Claude, GPT) во вкладке «AI» страницы «Интеграции»." : "Сменить — во вкладке «AI» страницы «Интеграции»."}
                    </p>
                  ) : (
                    <p className="flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      <AlertTriangle className="size-4 shrink-0" />
                      AI не подключён — пока продажник работает по шаблонам. Подключите модель во вкладке «AI» страницы «Интеграции».
                    </p>
                  )
                ) : null}
              </fieldset>

              {cfg.sell.engine === "ai" ? (
                <div className="space-y-3 rounded-xl border border-line p-3">
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-0.5 accent-wine" checked={cfg.sell.takeover} onChange={(e) => setSell({ takeover: e.target.checked })} aria-label="Подхватывать начатую переписку" />
                    <span>
                      Подхватывать начатую переписку, если менеджер не отвечает
                      <span className="block text-xs text-muted">
                        Клиент написал в уже идущий диалог (менеджер уже общался, переписка была до бота), а ответа нет {mode === "off_hours" ? "в рабочее время бот не вмешивается, ночью — сразу" : `${cfg.waitMinutes} мин в рабочее время, ночью — сразу`}: бот читает всю переписку и
                        продолжает с того места, где остановились, без повторного приветствия. Менеджеру приходит уведомление; как только он ответит сам — бот замолкает. Не подхватывает клиентов с заказом и закрытые сделки.
                        Кнопка «Остановить бота» в чате отключает бота в этом диалоге окончательно.
                      </span>
                    </span>
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs text-muted">Указания продажнику — тон, акценты, чего избегать (необязательно, до 1500 знаков). Цены и скидки сюда не пишите: они берутся из тарифов и строки акции.</span>
                    <textarea
                      value={cfg.sell.persona}
                      onChange={(e) => setSell({ persona: e.target.value })}
                      rows={3}
                      maxLength={1500}
                      placeholder="Например: говори тепло и коротко; клиентам старшего возраста объясняй подробнее; не упоминай конкурентов"
                      className={area}
                      aria-label="Указания продажнику"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    Потолок беседы
                    <input type="number" min={4} max={100} value={cfg.sell.maxTurns} onChange={(e) => setSell({ maxTurns: Math.max(4, Math.min(100, Math.floor(Number(e.target.value) || 4))) })} className="input h-9 w-20 text-sm" aria-label="Потолок беседы" />
                    ответов, дальше — менеджер
                  </label>
                </div>
              ) : null}

            <div className="grid gap-2 text-sm sm:grid-cols-2">
              {sellNumber("prepay", "Предоплата, ₸ ({предоплата}; 0 — не называть)", 0, 1_000_000)}
              {sellNumber("writeDays", "Сколько дней клиенты пишут книгу", 0, 30)}
              {sellNumber("productionDays", "Книга готовится, дней (после того как дописана)", 1, 30)}
              {sellNumber("deliveryDays", "Доставка по Казахстану, дней (с запасом; Алматы — в день готовности)", 0, 30)}
              {sellNumber("followUpHours", "Напомнить через, часов (AI — второе на следующий день; 0 — не напоминать)", 0, 72)}
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 accent-wine" checked={cfg.sell.invoice} onChange={(e) => setSell({ invoice: e.target.checked })} aria-label="Бот выставляет счёт" />
              <span>
                Бот сам выставляет счёт
                <span className="block text-xs text-muted">
                  На «да» бот выставляет счёт на предоплату (или на всю сумму, если предоплата 0): ссылка на оплату и счёт Kaspi на номер WhatsApp. После оплаты кабинет открывается сам. Не вышло (нет способа
                  оплаты, сделка закрыта) — менеджеру срочная задача «Выставить счёт». Тариф — электронная, если клиент её выбрал, иначе печатная; цена — из «Цен и тарифов».
                </span>
              </span>
            </label>
            {cfg.sell.engine === "ai" ? (
              <div className="space-y-3 rounded-xl border border-line p-3">
                <fieldset className="space-y-1.5 text-sm">
                  <legend className="mb-1 text-xs text-muted">От чьего имени пишет бот</legend>
                  {(
                    [
                      ["manager", `Сам менеджер — «Меня зовут ${cfg.sell.managerName || "Марат"}», от первого лица`],
                      ["assistant", `Помощница менеджера — «${cfg.sell.botName || "Айгерим"}, помощница менеджера ${cfg.sell.managerName || "Марат"}»`],
                    ] as const
                  ).map(([value, label]) => (
                    <label key={value} className="flex items-start gap-2">
                      <input type="radio" name="speaksAs" className="mt-0.5 accent-wine" checked={cfg.sell.speaksAs === value} onChange={() => setCfg((c) => revoiceConfig(c, value))} />
                      <span>{label}</span>
                    </label>
                  ))}
                </fieldset>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs text-muted">{cfg.sell.speaksAs === "manager" ? "Имя менеджера — от его имени пишет бот" : "Менеджер, чья она помощница (он называет цену)"}</span>
                    <input value={cfg.sell.managerName} onChange={(e) => setSell({ managerName: e.target.value })} maxLength={40} className="input h-9 w-full text-sm" aria-label="Имя менеджера" />
                  </label>
                  {cfg.sell.speaksAs === "assistant" ? (
                    <label className="block">
                      <span className="mb-1 block text-xs text-muted">Как помощница представляется (женское имя)</span>
                      <input value={cfg.sell.botName} onChange={(e) => setSell({ botName: e.target.value })} maxLength={40} className="input h-9 w-full text-sm" aria-label="Имя продажника" />
                    </label>
                  ) : null}
                </div>
                <p className="text-xs text-muted" data-testid="speaks-as-note">
                  {cfg.sell.speaksAs === "manager"
                    ? `Бот пишет как сам ${cfg.sell.managerName || "Марат"}: представляется его именем в новом чате, о передаче «менеджеру» не говорит. Сам не говорит, что ему помогает ИИ; если клиент прямо и всерьёз спросит, живой ли человек, — честно скажет, что отвечать помогает AI-помощник, и предложит продолжить лично.`
                    : `Сама не говорит, что она бот; если клиент прямо спросит, живой ли человек, — честно скажет, что виртуальная помощница, и предложит подключить менеджера.`}
                </p>
                <label className="block text-sm">
                  <span className="mb-1 flex items-center justify-between gap-2 text-xs text-muted">
                    Факты для продажника — сроки, доставка, как пишется книга, способы оплаты (без цен; по строке на факт)
                    <button type="button" className="text-wine underline" onClick={() => setSell({ facts: DEFAULT_SELL_FACTS })}>
                      по умолчанию
                    </button>
                  </span>
                  <textarea value={cfg.sell.facts} onChange={(e) => setSell({ facts: e.target.value })} rows={6} maxLength={2000} className={area} aria-label="Факты для продажника" />
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5 accent-wine" checked={cfg.sell.selfImprove} onChange={(e) => setSell({ selfImprove: e.target.checked })} aria-label="Учиться на своих ошибках" />
                  <span>
                    Учиться на своих ошибках
                    <span className="block text-xs text-muted">Каждую ночь бот разбирает свои беседы за день и сам пишет себе уроки — список и журнал ниже, в «Работе над ошибками».</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5 accent-wine" checked={cfg.sell.hidePrices} onChange={(e) => setSell({ hidePrices: e.target.checked })} aria-label="Бот не называет цены" />
                  <span>
                    Бот не называет цены — их озвучивает только менеджер
                    <span className="block text-xs text-muted">
                      На первый вопрос «сколько стоит» бот отвечает, что вариантов книги несколько и цену назовёт {cfg.sell.managerName || "менеджер"}, и выясняет, для кого книга и к какой дате; на повторный — передаёт
                      менеджеру задачу «Назвать цену». Счёт на «да» выставляет менеджер. Выключено — бот называет цену «от» из тарифов, но не сразу: сначала выясняет, для кого книга и к какой дате.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5 accent-wine" checked={cfg.sell.media} onChange={(e) => setSell({ media: e.target.checked })} aria-label="Распознавать голосовые и фото" />
                  <span>
                    Слушать голосовые и смотреть фото клиента
                    <span className="block text-xs text-muted">
                      Бот расшифровывает голосовые и описывает фото моделью из «Интеграции» → AI → «Голосовые и фото» и отвечает на них, как на текст; чек об оплате передаёт менеджеру. По умолчанию — Gemini Flash
                      через OpenRouter (DeepSeek вложения не понимает). Не распозналось — бот, как раньше, просит написать текстом или передаёт менеджеру.
                    </span>
                  </span>
                </label>
              </div>
            ) : null}
            <details className="rounded-xl border border-line p-3">
              <summary className="cursor-pointer text-sm">{cfg.sell.engine === "ai" ? "Запасные тексты продаж" : "Тексты продаж"} ({lang === "ru" ? "русский" : "қазақша"})</summary>
              {cfg.sell.engine === "ai" ? <p className="mt-2 text-xs text-muted">При движке AI эти тексты нужны, только если модель недоступна или счёт выставить не вышло (например, «менеджер пришлёт счёт»).</p> : null}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">{SELL_TEXTS.map(([k, label]) => textField(k, label))}</div>
            </details>
            </>
          ) : null}
          {cfg.sell.on && cfg.sell.engine === "ai" ? (
            <>
              {materials}
              {coach}
            </>
          ) : null}
        </div>
      ) : null}

      {tab === "qualifier" ? (
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

      ) : null}

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

      {tab === "test" ? (
        <>
          <BotTester config={cfg} />
          {stats}
        </>
      ) : null}
    </section>
  );
}
