/**
 * «Почему так?» у ответа бота: след хода AI-продажника строками для сотрудника — что решила модель, чем закончился ход,
 * что записано в сделку, срок к дате, что код поправил или остановил, уроки, база знаний и токены. Один вид для чата
 * и тест-режима в настройках бота. Чистые функции — можно в клиентских компонентах.
 */
import { handoffReasonLabels, failureReasonLabels } from "../domain/botStats";
import type { BotTurnTrace, TraceDeadline, TraceNote, TraceNoteCode } from "../domain/botTrace";

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
  remind_rejected: (d) => `дату повторного сообщения отбросил${d ? `: ${REMIND_REJECTS[d] ?? d}` : ""}`,
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
  return rows;
}
