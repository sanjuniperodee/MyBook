import type { SupportStatus } from "@/shared/domain/support";
import type { Ticket } from "../domain";

/** Новое обращение без номера и служебных полей. */
export type TicketDraft = Omit<Ticket, "id" | "number" | "createdAt" | "updatedAt">;

export interface TicketFilter {
  status?: SupportStatus | "open" | "all";
  q?: string;
  limit: number;
}

/** Хранилище обращений. */
export interface TicketRepository {
  nextId(): string;
  insert(id: string, draft: TicketDraft): Promise<Ticket>;
  byId(id: string): Promise<Ticket | null>;
  byNumber(n: number): Promise<Ticket | null>;
  byNumbers(ns: number[]): Promise<Ticket[]>;
  update(id: string, patch: Partial<TicketDraft>): Promise<void>;
  list(filter: TicketFilter): Promise<Ticket[]>;
  counts(): Promise<Record<SupportStatus, number>>;
}

/** Файлы вложений. */
export interface TicketFiles {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
}

/** AI: расшифровка звука (контекст «AI-помощник») и суть обращения. */
export interface TicketAi {
  transcribe(input: { system: string; glossary: string; data: string; mime: string }): Promise<{ text: string; by: string } | { error: string }>;
  brief(req: { system: string; user: string }): Promise<string | null>;
}

/** Звук из видео и любых голосовых — в Ogg Opus (ffmpeg): маленький файл, его понимает и Gemini, и Whisper. null — ffmpeg нет или файл не звук. */
export type AudioExtractor = (data: Uint8Array) => Promise<{ data: Uint8Array; mime: string } | null>;

/** Сообщение в WhatsApp с номера магазина. false — не ушло. */
export interface TicketMessenger {
  send(phone: string, text: string): Promise<boolean>;
}

/** Сотрудникам: пришло новое обращение. */
export interface TicketAlerts {
  created(t: Ticket): Promise<void>;
}

/** Сообщение диалога CRM, которое можно приложить к обращению (порт контекста «Переписка»). */
export interface ChatMessageRef {
  id: string;
  conversationId: string;
  direction: string;
  type: string;
  text: string;
  transcript: string | null;
  createdAt: Date;
}

/** Переписка клиента: найти диалог, взять выбранные сообщения и звук голосового. */
export interface TicketChats {
  conversation(id: string): Promise<{ id: string; contactName: string; chatId: string } | null>;
  messagesIn(conversationId: string, ids: string[]): Promise<ChatMessageRef[]>;
  mediaBytes(messageId: string): Promise<{ data: Uint8Array; mime: string } | null>;
}
