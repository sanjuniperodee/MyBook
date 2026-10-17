import { bookKind } from "@/lib/content/kinds";
import { dealSourceLabels } from "@/shared/domain/dealSources";
import { transcript, type AiMessage } from "./prompts";

/** Всё, что известно о сделке, — для резюме и извлечения полей. */
export interface DealDossier {
  deal: { id: string; number: number; title: string; source: string; amount: number; contactName: string; createdAt: Date; stageChangedAt: Date; customFields: Record<string, string | number | boolean | null> };
  stageName: string | null;
  /** Свои поля сделки «подпись → значение». */
  fieldValues: Record<string, string>;
  notes: { kind: string; text: string; at: Date }[];
  tasks: { title: string; dueAt: Date | null }[];
  calls: { direction: string; status: string; durationSec: number; at: Date }[];
  order: { number: number; status: string; amount: number; plan: string } | null;
  books: { title: string; theme: string; author: string; recipient: string; recordedBy: string; status: string; answered: number; total: number; words: number }[];
  messages: AiMessage[];
}

/** Строка досье о книге клиента: вид книги, для кого (или чья), статус и прогресс по виду. */
export function bookDossierLine(b: DealDossier["books"][number]): string {
  const kind = bookKind(b.theme);
  const status = b.status === "draft" ? "пишется" : "заказана";
  const title = `«${b.title || "без названия"}»`;
  if (kind === "autobiography") return `Автобиография ${title}${b.author ? `, рассказчик ${b.author}` : ""}${b.recordedBy ? `, записывает ${b.recordedBy}` : ""}: ${status}, ответов ${b.answered} из ${b.total}, слов ${b.words}.`;
  if (kind === "blank") return `Своя книга ${title}${b.author ? `, автор ${b.author}` : ""}${b.recipient ? ` для ${b.recipient}` : ""}: ${status}, разделов с текстом ${b.answered} из ${b.total}, слов ${b.words}.`;
  return `Книга на сайте ${title}${b.recipient ? ` для ${b.recipient}` : ""}: ${status}, ответов ${b.answered} из ${b.total}.`;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Досье одним текстом — так его читает модель. */
export function dossierText(d: DealDossier) {
  const { deal } = d;
  const lines = [
    `Сделка №${deal.number}: ${deal.title}`,
    `Этап: ${d.stageName ?? "—"}. Источник: ${dealSourceLabels[deal.source as keyof typeof dealSourceLabels] ?? deal.source}. Создана ${day(deal.createdAt)}, этап сменился ${day(deal.stageChangedAt)}.`,
    deal.amount ? `Сумма: ${deal.amount} ₸.` : "",
    deal.contactName ? `Контакт: ${deal.contactName}.` : "",
    Object.keys(d.fieldValues).length ? `Поля: ${Object.entries(d.fieldValues).map(([k, v]) => `${k}: ${v}`).join("; ")}.` : "",
    ...d.books.map(bookDossierLine),
    d.order ? `Заказ №${d.order.number}: ${d.order.status}, ${d.order.amount} ₸, тариф ${d.order.plan}.` : "Заказа пока нет.",
    d.tasks.length ? `Открытые задачи: ${d.tasks.map((t) => `${t.title}${t.dueAt ? ` (до ${day(t.dueAt)})` : ""}`).join("; ")}.` : "Открытых задач нет.",
    d.calls.length ? `Звонки: ${d.calls.map((c) => `${day(c.at)} ${c.direction === "out" ? "исходящий" : c.status === "missed" ? "пропущенный" : "входящий"}${c.durationSec ? ` ${Math.round(c.durationSec / 60)} мин` : ""}`).join("; ")}.` : "",
    d.notes.length ? `Заметки и события (новые сверху):\n${d.notes.map((n) => `- ${day(n.at)} ${n.text.replace(/\s+/g, " ").slice(0, 300)}`).join("\n")}` : "",
    d.messages.length ? `Переписка:\n${transcript(d.messages, 10_000)}` : "Переписки нет.",
  ];
  return lines.filter(Boolean).join("\n");
}

/** Источник для извлечения полей: переписка и заметки/звонки менеджеров. */
export function extractionSource(d: Pick<DealDossier, "messages" | "notes">) {
  return [d.messages.length ? transcript(d.messages, 10_000) : "", d.notes.filter((n) => n.kind === "note" || n.kind === "call").map((n) => `Заметка менеджера: ${n.text}`).join("\n")].filter(Boolean).join("\n\n");
}
