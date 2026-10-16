import { formatDate } from "@/lib/dates";
import { channelLabel, describeAttribution, isManualChannel, MANUAL_MEDIUM, toAttribution } from "@/shared/domain/channels";
import { staffLabel } from "@/shared/domain/staff";
import { noteViews, taskViews } from "./crm-items";

/**
 * Модель экрана клиента (admin/clients/[id]): задачи и история со ссылками на заказы, телефон, канал привлечения,
 * покупки (LTV, средний чек) и напоминание о недописанной книге. Без запросов — только раскладка загруженного.
 */
export function clientScreen(input: {
  client: { phone: string | null; source: Record<string, string> | null; remindedAt: Date | null };
  staff: { id: string; name: string; email: string }[];
  tasks: Parameters<typeof taskViews>[0];
  notes: Parameters<typeof noteViews>[0];
  orders: { id: string; number: number; status: string; contactPhone: string | null }[];
  books: { book: { status: string } }[];
  money: { total: number; sales: number };
  /** Можно ли напомнить сейчас (не чаще, чем позволяет notifications.canRemind). */
  remindAllowed: boolean;
  now: Date;
}) {
  const { client } = input;
  const names = new Map(input.staff.map((a) => [a.id, staffLabel(a)]));
  const orderNumbers = new Map(input.orders.map((o) => [o.id, o.number]));
  const rawPhone = client.phone ?? input.orders[0]?.contactPhone ?? "";
  // Канал: выбранный менеджером — по ключу; пришёл по меткам (реклама, ссылка) — «auto»; не определён — пусто.
  const src = client.source;
  const channelValue = !src || !Object.keys(src).length ? "" : src.medium === MANUAL_MEDIUM && isManualChannel(src.source) ? src.source : "auto";
  const attribution = toAttribution(client.source);
  const hasDraft = input.books.some((b) => b.book.status === "draft");
  // Покупки клиента — из единого журнала выручки: оплаченные заказы и платежи менеджера по его сделкам.
  const ltv = input.money.total;
  return {
    tasks: taskViews(input.tasks, names, input.now, { orders: orderNumbers }),
    notes: noteViews(input.notes, names, { orders: orderNumbers }),
    rawPhone,
    phoneDigits: rawPhone.replace(/\D/g, ""),
    channel: {
      value: channelValue,
      label: channelLabel(attribution),
      details: [describeAttribution(attribution), client.source?.link ? `ссылка ${client.source.link}` : ""].filter(Boolean).join(" · "),
    },
    stats: {
      ltv,
      orders: input.orders.filter((o) => o.status !== "cancelled").length,
      books: input.books.length,
      averageCheck: input.money.sales ? Math.round(ltv / input.money.sales) : null,
    },
    remind: {
      disabled: !hasDraft || !input.remindAllowed,
      hint: !hasDraft ? "Нет незавершённых книг" : client.remindedAt ? `Последнее напоминание: ${formatDate(client.remindedAt, true)}` : "Письмо со ссылкой на следующий вопрос",
    },
  };
}
