"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Bot, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/ui/overlays";
import { cn } from "@/lib/class-names";
import { saveBotAction } from "./actions";
import { BotTester } from "./BotTester";
import type { BotFormTab } from "./botTabs";
import { Field, Group, Note, Section, Toggle } from "../ui";
import { DEFAULT_SELL_FACTS, REMIND_TOUCHES_MAX, revoiceConfig, type BotChannel, type BotConfig, type BotLang, type BotTextKey, type FaqIntent } from "@/modules/messaging/domain/botConfig";

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

/** Карточка-вариант с пояснением: режим бота, движок продажника. */
function RadioCard({ active, children }: { active: boolean; children: React.ReactNode }) {
  return <label className={cn("flex cursor-pointer items-start gap-2.5 rounded-[var(--r-ctl)] border px-3 py-2.5 text-sm transition-colors", active ? "border-wine/50 bg-rose" : "border-line bg-white hover:border-line-strong")}>{children}</label>;
}

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
  // Последнее сохранённое состояние: по нему видно, есть ли несохранённые правки.
  const [savedJson, setSavedJson] = useState(() => JSON.stringify({ mode, cfg }));
  const dirty = JSON.stringify({ mode, cfg }) !== savedJson;
  const patch = (p: Partial<BotConfig>) => setCfg((c) => ({ ...c, ...p }));
  const setSell = (p: Partial<BotConfig["sell"]>) => setCfg((c) => ({ ...c, sell: { ...c.sell, ...p } }));
  const sellNumber = (key: "prepay" | "writeDays" | "deliveryDays" | "followUpHours" | "productionDays", label: string, min: number, max: number) => (
    <Field key={key} label={label}>
      <input type="number" min={min} max={max} value={cfg.sell[key]} onChange={(e) => setSell({ [key]: Math.max(min, Math.min(max, Math.floor(Number(e.target.value) || 0))) })} className="input" />
    </Field>
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
    <Field key={`${lang}-${key}`} label={label}>
      <textarea value={cfg.texts[lang][key]} placeholder={defaults.texts[lang][key]} onChange={(e) => setText(key, e.target.value)} rows={2} maxLength={500} className="input" />
    </Field>
  );

  const save = () =>
    start(async () => {
      const r = await saveBotAction({ mode, ...cfg });
      toast(r.error ?? r.ok ?? "Сохранено", r.error ? "error" : "success");
      if (!r.error) setSavedJson(JSON.stringify({ mode, cfg }));
    });

  const tabs: { id: BotFormTab; label: string; dot?: "on" | "off" }[] = [
    { id: "mode", label: "Когда работает", dot: mode === "off" ? "off" : "on" },
    { id: "qualifier", label: "Опрос и ответы" },
    { id: "sell", label: "Продажи", dot: cfg.sell.on ? "on" : "off" },
    { id: "test", label: "Проверка и статистика" },
  ];
  /** Переключатель языка текстов: русский / казахский. */
  const langBar = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2" role="tablist" aria-label="Язык текстов">
      <div className="flex rounded-[var(--r-ctl)] bg-sunken p-0.5 text-[13px]">
        {(["ru", "kk"] as const).map((l) => (
          <button
            key={l}
            type="button"
            role="tab"
            aria-selected={lang === l}
            onClick={() => setLang(l)}
            className={cn("min-h-10 rounded-[calc(var(--r-ctl)-2px)] px-3 font-medium transition-colors lg:min-h-7", lang === l ? "bg-white text-ink shadow-[0_1px_2px_rgb(0_0_0/0.12),0_0_0_1px_rgb(0_0_0/0.04)]" : "text-muted hover:text-ink")}
          >
            {l === "ru" ? "Русский" : "Қазақша"}
          </button>
        ))}
      </div>
      <span className="text-xs text-muted">Пустое поле — заводской текст. Казахский увидят клиенты, которые пишут по-казахски.</span>
    </div>
  );

  return (
    <div className="grid items-start gap-x-8 gap-y-3 lg:grid-cols-[13.5rem_minmax(0,1fr)]" data-testid="bot-form">
      <nav aria-label="Разделы настройки бота" className="sticky top-[var(--topbar-h)] z-10 -mx-4 min-w-0 bg-canvas/90 px-4 backdrop-blur sm:-mx-6 sm:px-6 lg:top-[calc(var(--topbar-h)+1.5rem)] lg:mx-0 lg:self-start lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 max-lg:hidden">
          <Bot className="size-4 shrink-0 text-wine" strokeWidth={1.8} aria-hidden />
          <h2 className="text-[15px] font-semibold whitespace-nowrap">Бот-автоответчик</h2>
          <Badge tone={mode === "off" ? "neutral" : "success"} className="lg:ml-6">
            {mode === "off" ? "выключен" : "включён"}
          </Badge>
        </div>
        <div className="no-scrollbar flex gap-1 overflow-x-auto py-2 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:p-0" role="tablist" aria-orientation="vertical" aria-label="Разделы настройки бота">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn("flex min-h-10 shrink-0 items-center gap-2.5 rounded-[var(--r-ctl)] px-2.5 text-left text-[13px] whitespace-nowrap transition-colors lg:min-h-8", tab === t.id ? "bg-white font-medium text-ink shadow-[inset_0_0_0_1px_var(--color-line)]" : "text-ink-soft hover:bg-ink/[0.05] hover:text-ink")}
            >
              {t.dot ? (
                <>
                  <span className={cn("size-2 shrink-0 rounded-full", t.dot === "on" ? "bg-success" : "bg-line-strong")} aria-hidden />
                  <span className="sr-only">{t.dot === "on" ? "включено: " : "выключено: "}</span>
                </>
              ) : (
                <span className="size-2 shrink-0 rounded-full border border-line-strong" aria-hidden />
              )}
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="min-w-0 space-y-4">
        {tab === "mode" ? (
          <Section id="bot-mode" title="Когда работает" description="Режим автоответчика и каналы" status={mode === "off" ? { tone: "off", label: "выключен" } : { tone: "ok", label: "включён" }}>
            <div className="space-y-5">
              <Note>
                На первое сообщение нового клиента бот здоровается, отвечает на частые вопросы (цена, доставка, сроки) и спрашивает недостающее — ответы записывает в поля сделки. Понимает русский и казахский и отвечает на языке клиента. Замолкает, как только ответит человек — из CRM или с телефона. Не пишет клиентам с заказом, книгой или сделкой в работе и тем, с кем переписка была до CRM.
              </Note>
              <Group title="Режим" hint="Когда бот отвечает на новые обращения.">
                <div className="grid gap-2 sm:grid-cols-2">
                  {MODES.map(([v, label, hint]) => (
                    <RadioCard key={v} active={mode === v}>
                      <input type="radio" checked={mode === v} onChange={() => setMode(v)} className="mt-[3px] accent-wine" />
                      <span>
                        {label}
                        {hint ? <span className="mt-0.5 block text-xs text-muted">{hint}</span> : null}
                      </span>
                    </RadioCard>
                  ))}
                </div>
                {mode === "fallback" ? (
                  <Field label="Ждать ответа менеджера, минут" className="max-w-40">
                    <input type="number" min={1} max={120} value={cfg.waitMinutes} onChange={(e) => patch({ waitMinutes: Math.max(1, Math.min(120, Number(e.target.value) || 1)) })} className="input" />
                  </Field>
                ) : null}
              </Group>
              <Group title="Где работает бот" hint="В почте — никогда.">
                <div className="flex flex-wrap gap-2 text-sm">
                  {CHANNELS.map(([v, label]) => (
                    <label key={v} className={cn("flex min-h-9 cursor-pointer items-center gap-2 rounded-[var(--r-ctl)] border px-3 transition-colors", cfg.channels.includes(v) ? "border-wine/50 bg-rose" : "border-line bg-white hover:border-line-strong")}>
                      <input type="checkbox" className="accent-wine" checked={cfg.channels.includes(v)} onChange={(e) => patch({ channels: e.target.checked ? [...cfg.channels, v] : cfg.channels.filter((c) => c !== v) })} />
                      {label}
                    </label>
                  ))}
                </div>
              </Group>
              {autoReplyRules.length ? (
                <p className="flex max-w-[40rem] gap-2 rounded-[var(--r-ctl)] bg-warning-bg px-3 py-2 text-sm text-warning">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>Включены правила-автоответы: {autoReplyRules.map((r) => `«${r}»`).join(", ")}. Пока бот ведёт диалог, они клиенту не пишут — двух автоответов подряд не будет.</span>
                </p>
              ) : null}
            </div>
          </Section>
        ) : null}

        {tab === "qualifier" ? (
          <>
            {langBar}
            <Section id="bot-questions" title="Приветствие и вопросы" description="Что бот пишет первым и что спрашивает у клиента">
              <div className="space-y-5">
                <Group title="Приветствие" hint="Первое сообщение новому клиенту.">
                  {textField("greeting", MAIN_TEXTS[0][1])}
                </Group>
                <Group title="Вопросы" hint="По очереди, только то, чего ещё нет в сделке. Что клиент уже написал сам («маме на юбилей 15 ноября»), бот не спрашивает.">
                  <div className="space-y-2">
                    {cfg.questions.map((q, i) => {
                      const f = fields.find((x) => x.key === q.field);
                      return (
                        <div key={i} className="space-y-2 rounded-[var(--r-ctl)] border border-line bg-white p-2.5">
                          <div className="flex items-start gap-2">
                            <span className="mt-2 w-5 shrink-0 text-center text-xs text-muted tabular-nums">{i + 1}</span>
                            <textarea
                              value={q.text[lang]}
                              placeholder={lang === "kk" ? "Пусто — заводской перевод или русский текст" : ""}
                              onChange={(e) => setQuestion(i, { text: e.target.value })}
                              rows={1}
                              maxLength={400}
                              className="input min-w-0 flex-1 resize-y field-sizing-content"
                              aria-label={`Вопрос ${i + 1}`}
                            />
                            <div className="flex shrink-0">
                              <button type="button" className="btn btn-ghost btn-icon btn-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Выше">
                                <ArrowUp className="size-4" />
                              </button>
                              <button type="button" className="btn btn-ghost btn-icon btn-sm" disabled={i === cfg.questions.length - 1} onClick={() => move(i, 1)} aria-label="Ниже">
                                <ArrowDown className="size-4" />
                              </button>
                              <button type="button" className="btn btn-ghost btn-icon btn-sm text-danger" onClick={() => patch({ questions: cfg.questions.filter((_, j) => j !== i) })} aria-label="Удалить вопрос">
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                          </div>
                          <div className="pl-7">
                            <select value={q.field} onChange={(e) => setQuestion(i, { field: e.target.value })} className="input" aria-label={`Поле для ответа ${i + 1}`}>
                              {fields.map((x) => (
                                <option key={x.key} value={x.key}>
                                  Записать в поле: {x.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          {f?.type === "select" && lang === "kk" ? (
                            <div className="grid gap-1.5 pl-7 sm:grid-cols-2">
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
                                    className="input flex-1"
                                    aria-label={`Вариант «${o}» по-казахски`}
                                  />
                                </label>
                              ))}
                            </div>
                          ) : null}
                          {f && (f.key === "recipient" || /для\s+кого|кому/i.test(f.label)) && f.type !== "select" ? (
                            <p className="pl-7 text-xs text-muted">Бот покажет варианты: любимому, маме, папе, родителям, семье, бабушке, дедушке, снохе, ребёнку, брату или сестре, другу, учителю — и «о себе (автобиография)», «своя книга с нуля», когда эти режимы есть на сайте. Тема пишется меткой сделки.</p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  {cfg.questions.length < 6 && fields.length ? (
                    <div>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => patch({ questions: [...cfg.questions, { field: fields[0].key, text: { ru: "", kk: "" } }] })}>
                        <Plus className="size-4" aria-hidden /> Вопрос
                      </button>
                    </div>
                  ) : null}
                  {!fields.length ? <p className="text-sm text-muted">Сначала создайте поля сделки в разделе «Свои поля» — в них бот будет записывать ответы.</p> : null}
                </Group>
              </div>
            </Section>

            <Section id="bot-texts" title="Тексты бота" description="Концовки опроса, передача менеджеру и другие реплики">
              <div className="space-y-5">
                <Group title="Основные" hint="Что бот отвечает в конце опроса и когда клиент просит человека.">
                  {MAIN_TEXTS.slice(1).map(([k, label]) => textField(k, label))}
                </Group>
                <details className="max-w-[40rem] rounded-[var(--r-ctl)] border border-line">
                  <summary className="flex min-h-9 cursor-pointer items-center px-3 text-sm text-ink-soft">Другие тексты бота</summary>
                  <div className="space-y-4 border-t border-line p-3">{OTHER_TEXTS.map(([k, label]) => textField(k, label))}</div>
                </details>
              </div>
            </Section>

            <Section id="bot-faq" title="Ответы на частые вопросы" description="Каждый — один раз за диалог, дальше бот задаёт свой вопрос">
              <div className="space-y-5">
                <Group
                  title="Ответы"
                  hint={`Цифры — только переменными, тогда они не разойдутся с «Ценами и тарифами»: ${vars.map((v) => `${v.key} = ${v.value || "—"}`).join(", ")}. Выключенный ответ бот не даёт — на вопрос ответит менеджер.`}
                >
                  <div className="space-y-2">
                    {FAQ.map(([intent, label]) => (
                      <div key={intent} className="space-y-2 rounded-[var(--r-ctl)] border border-line bg-white p-2.5">
                        <Toggle label={label} checked={cfg.faq[intent].on} onChange={(on) => patch({ faq: { ...cfg.faq, [intent]: { ...cfg.faq[intent], on } } })} />
                        {cfg.faq[intent].on ? (
                          <textarea
                            value={cfg.faq[intent].text[lang]}
                            placeholder={defaults.faq[intent].text[lang]}
                            onChange={(e) => patch({ faq: { ...cfg.faq, [intent]: { ...cfg.faq[intent], text: { ...cfg.faq[intent].text, [lang]: e.target.value } } } })}
                            rows={2}
                            maxLength={1000}
                            className="input"
                            aria-label={`Ответ: ${label}`}
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <Note>
                    Цену бот называет «от» — по «Ценам и тарифам» ({"{цена.электронная}"}, {"{цена.печатная}"}), и добавляет строку акции. Точную сумму со скидкой называет менеджер. Скрытый тариф бот не называет: строка с пустой переменной не отправляется.
                  </Note>
                </Group>
                <Group title="Акция" hint="Добавляется к ответу о цене.">
                  <Field
                    label="Акция ({акция})"
                    hint={`Проценты и сроки можно, суммы в тенге — нет. Пусто — бот про акции не говорит${lang === "kk" ? "; пустая казахская — клиент увидит русскую" : ""}.`}
                  >
                    <input value={cfg.promo[lang]} placeholder={lang === "kk" ? "Мысалы: бүгін күн соңына дейін 25% жеңілдік" : "Например: сегодня до конца дня скидка 25%"} onChange={(e) => patch({ promo: { ...cfg.promo, [lang]: e.target.value } })} maxLength={300} className="input" />
                  </Field>
                </Group>
              </div>
            </Section>

            <Section id="bot-after" title="Ссылка и AI-разбор ответов" description="Что бот делает после ответа «для кого» и когда не понял клиента">
              <div className="space-y-4">
                <Toggle
                  label="Ссылка после ответа «для кого»"
                  checked={cfg.sendLink}
                  onChange={(on) => patch({ sendLink: on })}
                  hint="Регистрация открыта — ссылка, чтобы начать книгу этой темы; закрыта — страница-пример нужного вида книги (/kniga/…), а доступ в кабинет откроет менеджер или оплаченный счёт из чата; у клиента с аккаунтом — новая книга в кабинете."
                />
                <Toggle
                  label="AI помогает понять ответ, если бот не понял сам"
                  checked={cfg.ai}
                  disabled={!aiModel}
                  onChange={(on) => patch({ ai: on })}
                  hint={
                    aiModel
                      ? `Модель: ${aiModel}. Только разбор ответа (до 6 секунд) — тексты клиенту всегда из настроек, цены AI не называет.${/free/i.test(aiModel) ? " Бесплатная модель OpenRouter бывает недоступна — для бота выберите конкретную модель в «Интеграциях»." : ""}`
                      : "AI-помощник не настроен — подключите его в разделе «AI-помощник» выше."
                  }
                />
              </div>
            </Section>
          </>
        ) : null}

        {tab === "sell" ? (
          <>
            {cfg.sell.on ? langBar : null}
            <Section id="bot-sell" title="Продажи" description="Ведёт ли бот клиента к покупке и кто ведёт беседу" status={cfg.sell.on ? { tone: "ok", label: "включены" } : { tone: "off", label: "выключены" }}>
              <div className="space-y-5" data-testid="bot-sell">
                <Toggle
                  label={<span className="font-medium">Бот продаёт</span>}
                  checked={cfg.sell.on}
                  onChange={(on) => setSell({ on })}
                  hint="Вместо «передала менеджеру» бот ведёт клиента к покупке: чем ценна книга, цена «от» и предоплата, успеем ли к дате, «Оформляем?», ответы на «дорого» и «подумаю», напоминание, а на «да» — счёт. Выключено — бот только собирает ответы (шаблоны на вкладке «Опрос и ответы»)."
                />
                {cfg.sell.on ? (
                  <>
                    <Group title="Кто ведёт продающую беседу" hint="Модель или заготовленные тексты.">
                      <div className="grid gap-2 sm:grid-cols-2">
                        {(
                          [
                            ["ai", "AI-продажник", "Модель сама понимает клиента (русский, казахский, смесь, опечатки), отвечает на любые вопросы, снимает возражения и ведёт к оплате. Цены, сроки, проценты, ссылки и счёт проверяет код: выдумать цену или скидку модель не может."],
                            ["template", "По шаблонам", "Бот отвечает заготовленными текстами по сценарию: предложение → возражение → «да». Предсказуемо, но не понимает свободную речь. Обычный бот-квалификатор всегда работает по шаблонам."],
                          ] as const
                        ).map(([v, label, hint]) => (
                          <RadioCard key={v} active={cfg.sell.engine === v}>
                            <input type="radio" name="sell-engine" checked={cfg.sell.engine === v} onChange={() => setSell({ engine: v })} className="mt-[3px] accent-wine" />
                            <span>
                              {label}
                              <span className="mt-0.5 block text-xs text-muted">{hint}</span>
                            </span>
                          </RadioCard>
                        ))}
                      </div>
                      {cfg.sell.engine === "ai" ? (
                        seller ? (
                          <p className={cn("rounded-[var(--r-ctl)] px-3 py-2 text-sm", /free/i.test(seller) ? "bg-warning-bg text-warning" : "bg-success-bg text-success")}>
                            Модель продажника: <b>{seller}</b>.{" "}
                            {/free/i.test(seller) ? "Бесплатные модели OpenRouter нестабильны и хуже держат правила — для продаж выберите сильную модель (Claude, GPT) во вкладке «AI» страницы «Интеграции»." : "Сменить — во вкладке «AI» страницы «Интеграции»."}
                          </p>
                        ) : (
                          <p className="flex gap-2 rounded-[var(--r-ctl)] bg-warning-bg px-3 py-2 text-sm text-warning">
                            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                            AI не подключён — пока продажник работает по шаблонам. Подключите модель во вкладке «AI» страницы «Интеграции».
                          </p>
                        )
                      ) : null}
                    </Group>

                    {cfg.sell.engine === "ai" ? (
                      <Group title="Поведение продажника" hint="Подхват переписки, тон и повторные сообщения.">
                        <Toggle
                          label="Подхватывать начатую переписку, если менеджер не отвечает"
                          checked={cfg.sell.takeover}
                          onChange={(on) => setSell({ takeover: on })}
                          hint={`Клиент написал в уже идущий диалог (менеджер уже общался, переписка была до бота), а ответа нет ${mode === "off_hours" ? "в рабочее время бот не вмешивается, ночью — сразу" : `${cfg.waitMinutes} мин в рабочее время, ночью — сразу`}: бот читает всю переписку и продолжает с того места, где остановились, без повторного приветствия. Менеджеру приходит уведомление; как только он ответит сам — бот замолкает. Не подхватывает клиентов с заказом и закрытые сделки. Кнопка «Остановить бота» в чате отключает бота в этом диалоге окончательно.`}
                        />
                        <Field label="Указания продажнику" optional hint="Тон, акценты, чего избегать (до 1500 знаков). Цены и скидки сюда не пишите: они берутся из тарифов и строки акции.">
                          <textarea
                            value={cfg.sell.persona}
                            onChange={(e) => setSell({ persona: e.target.value })}
                            rows={3}
                            maxLength={1500}
                            placeholder="Например: говори тепло и коротко; клиентам старшего возраста объясняй подробнее; не упоминай конкурентов"
                            className="input"
                          />
                        </Field>
                        <Field label="Потолок беседы, ответов" hint="Дальше беседу ведёт менеджер." className="max-w-40">
                          <input type="number" min={4} max={100} value={cfg.sell.maxTurns} onChange={(e) => setSell({ maxTurns: Math.max(4, Math.min(100, Math.floor(Number(e.target.value) || 4))) })} className="input" />
                        </Field>
                        <Toggle
                          label="Писать повторно в названное клиентом время"
                          checked={cfg.sell.remind}
                          onChange={(on) => setSell({ remind: on })}
                          hint="Клиент пишет «после зарплаты», «в пятницу», «ближе к празднику» — бот договаривается о конкретном дне и пишет в этот день сам, в рабочее время. Дату проверяет код: не дальше указанного срока, не позже даты, к которой нужна книга, не тем, кто просил не писать первым. Менеджер видит договорённость в чате и сделке; ответит сам — бот замолчит."
                        />
                        <Toggle
                          label="Написать в последний день, чтобы успеть к дате"
                          checked={cfg.sell.lastStart}
                          onChange={(on) => setSell({ lastStart: on })}
                          hint="Тёплый клиент назвал дату, но так и не оформил и замолчал — бот пишет ему один раз в последний день, когда ещё можно начать книгу и успеть обычным сроком (по «Сколько дней пишут», «Книга готовится» и доставке)."
                        />
                        {cfg.sell.remind || cfg.sell.lastStart ? (
                          <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Не дальше, дней вперёд">
                              <input type="number" min={1} max={180} value={cfg.sell.remindMaxDays} onChange={(e) => setSell({ remindMaxDays: Math.max(1, Math.min(180, Math.floor(Number(e.target.value) || 1))) })} className="input" />
                            </Field>
                            <Field label="Не больше таких сообщений за беседу">
                              <input type="number" min={1} max={REMIND_TOUCHES_MAX} value={cfg.sell.remindTouches} onChange={(e) => setSell({ remindTouches: Math.max(1, Math.min(REMIND_TOUCHES_MAX, Math.floor(Number(e.target.value) || 1))) })} className="input" />
                            </Field>
                          </div>
                        ) : null}
                      </Group>
                    ) : null}
                  </>
                ) : null}
              </div>
            </Section>

            {cfg.sell.on ? (
              <Section id="bot-terms" title="Условия и счёт" description="Предоплата, сроки и выставление счёта ботом">
                <div className="space-y-5">
                  <Group title="Сроки и предоплата" hint="Из этих цифр бот считает, успеем ли к дате клиента.">
                    <div className="grid gap-4 sm:grid-cols-2">
                      {sellNumber("prepay", "Предоплата, ₸ ({предоплата}; 0 — не называть)", 0, 1_000_000)}
                      {sellNumber("writeDays", "Сколько дней клиенты пишут книгу", 0, 30)}
                      {sellNumber("productionDays", "Книга готовится, дней (после того как дописана)", 1, 30)}
                      {sellNumber("deliveryDays", "Доставка по Казахстану, дней (с запасом; Алматы — в день готовности)", 0, 30)}
                      {sellNumber("followUpHours", "Напомнить через, часов (AI — второе на следующий день; 0 — не напоминать)", 0, 72)}
                    </div>
                  </Group>
                  <Group title="Счёт">
                    <Toggle
                      label="Бот сам выставляет счёт"
                      checked={cfg.sell.invoice}
                      onChange={(on) => setSell({ invoice: on })}
                      hint="На «да» бот выставляет счёт на предоплату (или на всю сумму, если предоплата 0): ссылка на оплату и счёт Kaspi на номер WhatsApp. После оплаты кабинет открывается сам. Не вышло (нет способа оплаты, сделка закрыта) — менеджеру срочная задача «Выставить счёт». Тариф — электронная, если клиент её выбрал, иначе печатная; цена — из «Цен и тарифов»."
                    />
                  </Group>
                </div>
              </Section>
            ) : null}

            {cfg.sell.on && cfg.sell.engine === "ai" ? (
              <Section id="bot-voice" title="Голос и знания продажника" description="От чьего имени пишет бот, что он знает и чему учится">
                <div className="space-y-5">
                  <Group title="От чьего имени пишет бот">
                    <div className="space-y-2 text-sm">
                      {(
                        [
                          ["manager", `Сам менеджер — «Меня зовут ${cfg.sell.managerName || "Марат"}», от первого лица`],
                          ["assistant", `Помощница менеджера — «${cfg.sell.botName || "Айгерим"}, помощница менеджера ${cfg.sell.managerName || "Марат"}»`],
                        ] as const
                      ).map(([value, label]) => (
                        <label key={value} className="flex cursor-pointer items-start gap-2.5">
                          <input type="radio" name="speaksAs" className="mt-[3px] accent-wine" checked={cfg.sell.speaksAs === value} onChange={() => setCfg((c) => revoiceConfig(c, value))} />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label={cfg.sell.speaksAs === "manager" ? "Имя менеджера — от его имени пишет бот" : "Менеджер, чья она помощница (он называет цену)"}>
                        <input value={cfg.sell.managerName} onChange={(e) => setSell({ managerName: e.target.value })} maxLength={40} className="input" />
                      </Field>
                      {cfg.sell.speaksAs === "assistant" ? (
                        <Field label="Как помощница представляется (женское имя)">
                          <input value={cfg.sell.botName} onChange={(e) => setSell({ botName: e.target.value })} maxLength={40} className="input" />
                        </Field>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted" data-testid="speaks-as-note">
                      {cfg.sell.speaksAs === "manager"
                        ? `Бот пишет как сам ${cfg.sell.managerName || "Марат"}: представляется его именем в новом чате, о передаче «менеджеру» не говорит. Сам не говорит, что ему помогает ИИ; если клиент прямо и всерьёз спросит, живой ли человек, — честно скажет, что отвечать помогает AI-помощник, и предложит продолжить лично.`
                        : `Сама не говорит, что она бот; если клиент прямо спросит, живой ли человек, — честно скажет, что виртуальная помощница, и предложит подключить менеджера.`}
                    </p>
                  </Group>
                  <Group title="Знания" hint="Что продажник знает о сроках, доставке и оплате.">
                    <Field label="Факты для продажника" hint="Сроки, доставка, как пишется книга, способы оплаты (без цен; по строке на факт).">
                      <textarea value={cfg.sell.facts} onChange={(e) => setSell({ facts: e.target.value })} rows={6} maxLength={2000} className="input" />
                    </Field>
                    <div>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSell({ facts: DEFAULT_SELL_FACTS })}>
                        Вернуть факты по умолчанию
                      </button>
                    </div>
                  </Group>
                  <Group title="Возможности" hint="Обучение, цены и распознавание вложений.">
                    <Toggle label="Учиться на своих ошибках" checked={cfg.sell.selfImprove} onChange={(on) => setSell({ selfImprove: on })} hint="Каждую ночь бот разбирает свои беседы за день и сам пишет себе уроки — список и журнал ниже, в «Работе над ошибками»." />
                    <Toggle
                      label="Бот не называет цены — их озвучивает только менеджер"
                      checked={cfg.sell.hidePrices}
                      onChange={(on) => setSell({ hidePrices: on })}
                      hint={`На первый вопрос «сколько стоит» бот отвечает, что вариантов книги несколько и цену назовёт ${cfg.sell.managerName || "менеджер"}, и выясняет, для кого книга и к какой дате; на повторный — передаёт менеджеру задачу «Назвать цену». Счёт на «да» выставляет менеджер. Выключено — бот называет цену «от» из тарифов, но не сразу: сначала выясняет, для кого книга и к какой дате.`}
                    />
                    <Toggle
                      label="Слушать голосовые и смотреть фото клиента"
                      checked={cfg.sell.media}
                      onChange={(on) => setSell({ media: on })}
                      hint="Бот расшифровывает голосовые и описывает фото моделью из «Интеграции» → AI → «Голосовые и фото» и отвечает на них, как на текст; чек об оплате передаёт менеджеру. По умолчанию — Gemini Flash через OpenRouter (DeepSeek вложения не понимает). Не распозналось — бот, как раньше, просит написать текстом или передаёт менеджеру."
                    />
                  </Group>
                </div>
              </Section>
            ) : null}

            {cfg.sell.on ? (
              <Section id="bot-sell-texts" defaultOpen={false} title={`${cfg.sell.engine === "ai" ? "Запасные тексты продаж" : "Тексты продаж"} (${lang === "ru" ? "русский" : "қазақша"})`} description={cfg.sell.engine === "ai" ? "Нужны, если модель недоступна или счёт выставить не вышло" : "Реплики сценария: предложение, возражения, согласие"}>
                <div className="space-y-4">
                  {cfg.sell.engine === "ai" ? <Note>При движке AI эти тексты нужны, только если модель недоступна или счёт выставить не вышло (например, «менеджер пришлёт счёт»).</Note> : null}
                  <div className="max-w-[40rem] space-y-4">{SELL_TEXTS.map(([k, label]) => textField(k, label))}</div>
                </div>
              </Section>
            ) : null}

            {cfg.sell.on && cfg.sell.engine === "ai" ? (
              <>
                {materials}
                {coach}
              </>
            ) : null}
          </>
        ) : null}

        {tab === "test" ? (
          <>
            <BotTester config={cfg} />
            {stats}
          </>
        ) : null}

        <div className="sticky bottom-[var(--tabbar-h,0px)] z-[5] -mx-4 flex items-center gap-x-4 gap-y-2 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:mx-0 lg:rounded-[var(--r-panel)] lg:border lg:bg-white/95 lg:px-5">
          <button className="btn btn-dark" disabled={pending || !dirty} onClick={save}>
            {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null} Сохранить бота
          </button>
          <span className={cn("inline-flex items-center gap-1.5 text-sm", dirty ? "text-warning" : "text-muted")} role="status">
            <span className={cn("size-2 shrink-0 rounded-full", dirty ? "bg-warning" : "bg-success")} aria-hidden />
            <span className="sm:hidden">{dirty ? "Не сохранено" : "Сохранено"}</span>
            <span className="max-sm:hidden">{dirty ? "Есть несохранённые изменения" : "Все изменения сохранены"}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
