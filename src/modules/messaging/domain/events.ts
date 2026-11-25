import { domainEvent, type DomainEvent } from "@/shared/domain";

export interface ManagerReplyPayload {
  conversationId: string;
  channel: string;
  chatId: string;
  clientId: string | null;
  dealId: string | null;
  phone: string | null;
  authorId: string | null;
  text: string;
}

/** Исходящий ответ живого менеджера клиенту (из CRM или с телефона магазина — не бот и не системная рассылка). */
export type ManagerReplied = DomainEvent<"messaging.manager_replied", ManagerReplyPayload>;

export type MessagingEvent = ManagerReplied;

export const MessagingEvents = {
  managerReplied: (p: ManagerReplyPayload): ManagerReplied => domainEvent("messaging.manager_replied", p),
};
