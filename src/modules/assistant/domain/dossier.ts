import { dealSourceLabels } from "@/modules/sales/domain/meta";
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
  books: { title: string; recipient: string; status: string; answered: number; total: number }[];
  messages: AiMessage[];
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
    ...d.books.map((b) => `Книга на сайте «${b.title || "без названия"}»${b.recipient ? ` для ${b.recipient}` : ""}: ${b.status === "draft" ? "пишется" : "заказана"}, ответов ${b.answered} из ${b.total}.`),
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
