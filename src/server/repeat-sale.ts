import "server-only";
import { container } from "@/server/container";
import { draftNote, fillTemplate } from "@/shared/domain/templates";

/** За раз — не больше: менеджеры одного-двух человек больше не обработают, а номер WhatsApp не выдержит. */
export const REPEAT_SALE_MAX = 200;

export interface RepeatSaleInput {
  clientIds: string[];
  /** Название сделки и задачи: «Повторная продажа: 14 февраля». */
  title: string;
  /** Готовый текст клиенту ({имя} — имя клиента); казахский — клиентам с казахским языком, пусто — русский. */
  text: string;
  textKk?: string;
  /** Тег сделки — по нему потом видно, кто откликнулся на эту добивку. */
  tag?: string;
  /** Кто запустил: ответственный, если у клиента своего нет. */
  actorId: string;
}

export interface RepeatSaleResult {
  created: number;
  skipped: { noMarketing: number; openDeal: number; notFound: number };
}

/** Порты ручной добивки — для теста без базы. */
export interface RepeatSaleDeps {
  client(id: string): Promise<{ id: string; name: string; email: string; phone: string | null; managerId: string | null; locale?: "ru" | "kk" } | null>;
  noMarketing(phone: string | null): Promise<boolean>;
  hasOpenDeal(clientId: string): Promise<boolean>;
  createDeal(input: { title: string; clientId: string; contactName: string; contactPhone: string | null; contactEmail: string; assigneeId: string | null }): Promise<{ id: string; assigneeId: string | null }>;
  addTag(dealId: string, tag: string): Promise<void>;
  draft(dealId: string, clientId: string, text: string): Promise<void>;
  task(input: { title: string; dealId: string; clientId: string; assigneeId: string | null }): Promise<void>;
}

/**
 * Ручная добивка к 14 февраля и 8 Марта без рассылки (contacts-14): по выбранным клиентам — сделка «Повторная продажа»,
 * готовый текст в истории сделки (отправит менеджер — кнопкой «Открыть в WhatsApp» на телефоне магазина) и задача
 * написать клиенту. Клиенту CRM ничего не отправляет. Пропускает тех, кто просил не писать первым, и тех, с кем уже
 * работают (открытая сделка).
 */
export async function repeatSale(d: RepeatSaleDeps, input: RepeatSaleInput): Promise<RepeatSaleResult> {
  const out: RepeatSaleResult = { created: 0, skipped: { noMarketing: 0, openDeal: 0, notFound: 0 } };
  for (const id of input.clientIds.slice(0, REPEAT_SALE_MAX)) {
    const c = await d.client(id);
    if (!c) {
      out.skipped.notFound++;
      continue;
    }
    if (await d.noMarketing(c.phone)) {
      out.skipped.noMarketing++;
      continue;
    }
    if (await d.hasOpenDeal(c.id)) {
      out.skipped.openDeal++;
      continue;
    }
    const deal = await d.createDeal({ title: input.title, clientId: c.id, contactName: c.name, contactPhone: c.phone, contactEmail: c.email, assigneeId: c.managerId ?? input.actorId });
    if (input.tag) await d.addTag(deal.id, input.tag);
    const text = c.locale === "kk" && input.textKk?.trim() ? input.textKk : input.text;
    await d.draft(deal.id, c.id, fillTemplate(text, { name: c.name.trim().split(/\s+/)[0] || "" }));
    await d.task({ title: `Написать: ${input.title}`, dealId: deal.id, clientId: c.id, assigneeId: deal.assigneeId });
    out.created++;
  }
  return out;
}

/** Порты из контекстов CRM: клиенты, продажи, стоп-лист переписки, задачи с напоминанием (через 4 рабочих часа). */
export function repeatSaleDeps(): RepeatSaleDeps {
  const c = container();
  return {
    client: (id) => c.clients.clients.find(id),
    noMarketing: (phone) => c.messaging.chats.noMarketing(phone),
    hasOpenDeal: async (clientId) => !!(await c.sales.deals.findOpen({ clientId })),
    createDeal: (input) => c.sales.deals.create({ ...input, source: "repeat" }),
    addTag: async (dealId, tag) => void (await c.sales.deals.addTag(dealId, tag)),
    draft: async (dealId, clientId, text) => void (await c.clients.notes.addSystemOnce({ dealId, clientId, text: draftNote("ручная добивка", text) })),
    task: async (t) =>
      void (await c.clients.tasks.createSystem({ title: t.title, kind: "message", dueAt: await c.workspace.schedule.addWorkMinutes(new Date(), 240), clientId: t.clientId, dealId: t.dealId, assigneeId: t.assigneeId, once: true })),
  };
}
