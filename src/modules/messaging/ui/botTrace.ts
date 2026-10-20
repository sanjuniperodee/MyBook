/**
 * «Почему так?» у ответа бота: след хода AI-продажника строками для сотрудника — что решила модель, чем закончился ход,
 * что записано в сделку, срок к дате, что код поправил или остановил, уроки, база знаний и токены. Один вид для чата
 * и тест-режима в настройках бота. Чистые функции — можно в клиентских компонентах.
 */
import { handoffReasonLabels, failureReasonLabels } from "../domain/botStats";
import type { BotTurnTrace, TraceDeadline, TraceNote, TraceNoteCode, TraceRoute } from "../domain/botTrace";

const ACTIONS: Record<string, string> = {
  reply: "ответить",
  wait: "промолчать",
  issue_invoice: "выставить счёт",
  handoff: "передать менеджеру",
  close_lost: "закрыть: клиенту не интересно",
};

const STAGES: Record<string, string> = {
  greeting: "знакомство",
  discovery: "выясняет, для кого и к какой дате",
  offer: "предложение",
  objection: "возражение",
  closing: "предлагает оформить",
  agreed: "клиент согласился",
  handoff: "передача менеджеру",
  lost: "отказ",
};

const OUTCOMES: Record<string, string> = {
  handoff: "передал менеджеру",
  declined: "клиенту не интересно — беседа закрыта",
  invoiced: "выставил счёт",
  finished: "собрал ответы",
  offered: "предложение без ответа",
  abandoned: "клиент замолчал",
  stopped_by_manager: "остановлен менеджером",
  skipped: "не вмешивался",
  disabled: "бот выключен",
};

/** Почему код не дал выставить счёт (invoiceBlocker и настройки счёта). */
const INVOICE_BLOCKS: Record<string, string> = {
  client_not_agreed: "клиент не согласился",
  plan_unknown: "формат книги не выбран",
  no_quote: "нет слов согласия клиента",
  quote_not_from_client: "слов согласия нет в сообщениях клиента",
  quote_not_agreement: "это не согласие: вопрос, возражение или сомнение",
  not_asked_to_order: "оформить ещё не предлагали",
  price_not_quoted: "цену клиенту ещё не называли",
  invoice_off: "счёт от бота выключен в настройках",
  prices_hidden: "цены называет только менеджер",
  no_price: "нет цены в «Ценах и тарифах»",
};

/** Почему код не принял дату повторного сообщения (remindVerdict). */
const REMIND_REJECTS: Record<string, string> = {
  format: "не дата",
  past: "дата уже прошла",
  too_far: "слишком далеко вперёд",
  after_event: "позже даты, к которой нужна книга",
  off_hours: "нерабочий день или час",
  limit: "лимит повторных сообщений за беседу",
  no_marketing: "клиент просил не писать первым",
  paid: "клиент уже платил",
  off: "выключено в настройках",
};

const NOTES: Record<TraceNoteCode, (detail: string) => string> = {
  rewrite: (d) => `первый ответ не прошёл проверку — модель переписала${d ? ` (${d})` : ""}`,
  blocked_twice: (d) => `ответ дважды не прошёл проверку — вместо него «передала менеджеру»${d ? ` (${d})` : ""}`,
  greeting_removed: () => "убрал повторное «Здравствуйте»: сегодня уже здоровались",
  intro_added: () => "добавил представление: модель забыла представиться",
  limit: (d) => `потолок беседы${d ? ` (${d} ходов)` : ""} — передал менеджеру`,
  loop: () => "модель повторила прошлое сообщение — не отправлено, передал менеджеру",
  unanswered: () => "модель хотела промолчать на вопрос клиента — передал менеджеру",
  price_asks: (d) => `цену спросили ${d ? `в ${d}-й раз` : "снова"} — передал менеджеру`,
  objections: (d) => `${d ? `${d}-е` : "очередное"} возражение — передал менеджеру`,
  invoice_blocked: (d) => `счёт не выставлен: ${INVOICE_BLOCKS[d] ?? d}`,
  invoice_failed: (d) => `счёт не выставился${d ? `: ${d}` : ""} — клиенту «менеджер пришлёт», менеджеру задача`,
  already_paid: () => "клиент уже платил — счёт решает менеджер",
  deadline_recheck: () => "клиент назвал дату или город — срок посчитал код, модель ответила с этим вердиктом",
  sensitive: () => "в тексте номер, карта или реквизиты — сообщение не отправлено",
  stopped: () => "менеджер ответил посреди хода — дальше бот не писал",
  ai_error: () => "модель не ответила",
  voice: () => "голосовое без распознавания — попросил написать текстом",
  media: () => "фото или файл без распознавания — передал менеджеру",
  follow_up_skipped: (d) => `напоминание не прошло проверку — не отправлено${d ? ` (${d})` : ""}`,
  remind_set: (d) => `договорились: бот напишет клиенту${d ? ` ${d}` : " в названный день"}`,
  remind_kept: (d) => `клиент подтвердил договорённость — бот напишет${d ? ` ${d}` : " в назначенный день"}`,
  remind_dropped: (d) => (d === "last_start" ? "клиент написал сам — сообщение в последний день отменено (бот назначит его снова, если клиент замолчит)" : "клиент вернулся к разговору раньше срока — договорённость снята, дальше как обычно"),
  remind_rejected: (d) => `дату повторного сообщения отбросил${d ? `: ${REMIND_REJECTS[d] ?? d}` : ""}`,
  remind_broken: (d) => `ответ с обещанием написать${d ? ` ${d}` : ""} ушёл, а сам бот не напишет — менеджеру задача`,
  remind_cancelled: () => "клиент передумал — повторное сообщение отменено",
  remind_touch: (d) => `написал по договорённости${d ? ` (${d})` : ""}`,
  last_start: (d) => `написал в последний день, чтобы успеть к дате${d ? ` (${d})` : ""}`,
};

const DEADLINES: Record<TraceDeadline["kind"], string> = {
  ok: "успеваем",
  tight: "успеваем впритык",
  express: "только с экспресс-печатью",
  late: "печатную к этой дате не успеть",
};

const reasonLabel = (r: string) => handoffReasonLabels[r] ?? (failureReasonLabels as Record<string, string>)[r] ?? r;

/** «2026-11-05» → «5 ноября». */
export function traceDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", day: "numeric", month: "long" }).format(d);
}

export const traceNoteText = (n: TraceNote) => NOTES[n.code]?.(n.detail ?? "") ?? n.code;

export function deadlineText(d: TraceDeadline): string {
  const express = d.expressFillBy ? `, с экспресс-печатью — до ${traceDay(d.expressFillBy)}` : "";
  const fill = d.kind === "late" ? "" : `, дописать до ${traceDay(d.fillBy)}`;
  return `${traceDay(d.date)}${d.city ? ` (${d.city})` : ""}: ${DEADLINES[d.kind] ?? d.kind}${fill}${express}`;
}

export interface TraceRow {
  label: string;
  lines: string[];
  /** Код что-то поправил или остановил — строка выделяется. */
  warn?: boolean;
}

/** След хода строками: подпись → значения. Пустые части пропускаются. */
export function traceRows(t: BotTurnTrace): TraceRow[] {
  const rows: TraceRow[] = [];
  if (t.purpose === "follow_up") rows.push({ label: "Ход", lines: ["напоминание молчащему клиенту"] });
  if (t.model) {
    const why = t.model.handoff !== "none" ? ` · причина: ${reasonLabel(t.model.handoff)}` : "";
    rows.push({ label: "Модель решила", lines: [`${ACTIONS[t.model.action] ?? t.model.action} · этап: ${STAGES[t.model.stage] ?? t.model.stage}${why} · язык: ${t.model.lang === "kk" ? "казахский" : "русский"}`] });
    if (t.model.summary) rows.push({ label: "Заметка модели", lines: [t.model.summary] });
  } else rows.push({ label: "Модель", lines: [t.error ? `не ответила: ${t.error}` : "не спрашивали — ответ из шаблона"], warn: !!t.error });
  const outcome = t.result.phase === "done" ? `${OUTCOMES[t.result.outcome ?? ""] ?? "беседа закрыта"}${t.result.handoff ? `: ${reasonLabel(t.result.handoff)}` : ""}` : "беседа продолжается";
  rows.push({ label: "Итог хода", lines: [outcome] });
  const fields = Object.entries(t.fields);
  if (fields.length) rows.push({ label: "Записал в сделку", lines: fields.map(([k, v]) => `${k}: ${v}`) });
  if (t.deadline) rows.push({ label: "Срок к дате (считает код)", lines: [deadlineText(t.deadline)] });
  if (t.materials) rows.push({ label: "Подборка материалов", lines: [t.materials.files ? `ушла (файлов: ${t.materials.files})` : "файлы не ушли"], warn: !t.materials.files });
  if (t.notes.length) rows.push({ label: "Что сделал код", lines: t.notes.map(traceNoteText), warn: true });
  if (t.lessons.length) rows.push({ label: `Уроки в инструкции (${t.lessons.length})`, lines: t.lessons.map((l) => l.text) });
  if (t.knowledge) rows.push({ label: "База знаний", lines: t.knowledge.all ? ["целиком"] : t.knowledge.titles.length ? t.knowledge.titles : ["начало базы (по теме ничего не нашлось)"] });
  if (t.tokens) rows.push({ label: "Токены", lines: [`${t.tokens.input} на входе, ${t.tokens.output} в ответе · запросов к модели: ${t.tokens.calls}`] });
  if (t.media?.length) rows.push(mediaRow(t.media));
  if (t.route) rows.push(routeRow(t.route));
  return rows;
}

const MEDIA_KINDS: Record<string, string> = { audio: "голосовое", image: "фото", pdf: "PDF", document: "документ", text: "текст", video: "видео", executable: "исполняемый файл", unknown: "непонятный файл" };
const MEDIA_STATUS: Record<string, string> = {
  ok: "распознано",
  cached: "уже было распознано — без нового запроса",
  unsupported: "модель такое не умеет",
  rejected: "не разбирали (файл не тот, за что себя выдаёт, или повреждён)",
  failed: "не распозналось (сбой или неразборчиво)",
  limit: "лимит на распознавание в беседе",
  too_long: "слишком большой или длинный файл",
};

/** Вложения хода: что это по содержимому и чем кончилось распознавание. */
function mediaRow(media: NonNullable<BotTurnTrace["media"]>): TraceRow {
  const lines = media.map((m) => `${MEDIA_KINDS[m.kind] ?? m.kind}: ${MEDIA_STATUS[m.status] ?? m.status}${m.status === "ok" ? ` (${m.chars} знаков${m.pages ? `, ${m.pages} стр.` : ""}${m.costUsd ? `, $${m.costUsd.toFixed(5)}` : ""})` : ""}`);
  return { label: "Вложения клиента", lines, warn: media.some((m) => m.status !== "ok" && m.status !== "cached") };
}

const TIER_LABELS: Record<string, string> = { haiku: "Haiku", sonnet: "Sonnet", opus: "Opus" };
const ROUTE_REASONS: Record<string, string> = {
  price_objection: "возражение по цене",
  later_objection: "«подумаю / позже»",
  repeat_objection: "повторное возражение",
  discount: "просит скидку",
  compare: "сравнение вариантов",
  constraints: "несколько условий сразу",
  contradiction: "противоречивые условия",
  unresolved: "вопрос не решён",
  ambiguous: "много вопросов сразу",
  deadline: "срок впритык или не успеть",
  stakes: "счёт и оплата",
  prior_failure: "сбои в этой беседе",
  negotiation: "переговоры продолжаются",
  budget: "потолок расходов",
};
const CAUSES: Record<string, string> = { invalid: "ответ не по схеме", rejected: "ответ не прошёл проверку", unsure: "модель не уверена", error: "модель не ответила" };
const CALLS: Record<string, string> = { first: "ответ", retry: "повтор", deadline: "пересчёт срока", rewrite: "переписать", unsure: "уровнем выше", context: "короче переписка" };
const tierLabel = (t: string | null) => (t ? (TIER_LABELS[t] ?? t) : "запасная");
const money = (n: number) => `$${n.toFixed(n < 0.01 ? 5 : 4)}`;

/** Маршрут модели: выбранный уровень и почему, эскалации, каждый запрос (кто ответил, кэш, стоимость, сбой). */
function routeRow(r: TraceRoute): TraceRow {
  const mode = r.mode === "shadow" ? " (наблюдение: ответила модель по умолчанию)" : r.mode === "off" ? " (маршрутизация выключена)" : "";
  const why = r.reasons.length ? ` · ${r.reasons.map((x) => ROUTE_REASONS[x] ?? x).join(", ")}` : " · обычный ход";
  const lines = [`выбран ${tierLabel(r.chosen)}${why}${mode}`];
  for (const e of r.escalations) lines.push(`${tierLabel(e.from)} → ${tierLabel(e.to)}: ${CAUSES[e.cause] ?? e.cause}`);
  for (const c of r.calls) {
    const who = `${c.fallback ? "запасная " : ""}${c.model || c.provider || tierLabel(c.tier)}`;
    const cache = c.cacheRead || c.cacheWrite ? `, кэш ${c.cacheRead}/${c.cacheWrite}` : "";
    const retries = c.retries ? ` · неудачных попыток: ${c.retries}` : "";
    lines.push(c.failed ? `${CALLS[c.why] ?? c.why}: ${who} — сбой (${c.failed})${retries}` : `${CALLS[c.why] ?? c.why}: ${who} · ${c.input}+${c.output} ток.${cache} · ${c.costUsd === null ? "цены нет в прайсе" : money(c.costUsd)} · ${(c.ms / 1000).toFixed(1)} с${retries}`);
  }
  lines.push(`итого за ход: ${money(r.costUsd)}${r.capped ? " · потолок расходов: только Haiku" : ""}`);
  return { label: "Маршрут модели", lines, warn: r.escalations.length > 0 || r.calls.some((c) => c.failed || c.fallback) };
}
