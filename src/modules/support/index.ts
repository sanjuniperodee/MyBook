import type { Clock, Logger, StoredFile, StoredFileRequest } from "@/shared/application";
import { getFile, localPath, openStoredFile, putFile } from "@/shared/infrastructure/storage";
import type { SupportAttachment } from "@/shared/domain/support";
import { TicketsService, type AudioExtractor, type TicketAi, type TicketAlerts, type TicketChats, type TicketMessenger } from "./application";
import { DrizzleTicketRepository } from "./infrastructure/persistence";

export { SupportError, chatMessageText, ticketAlert, ticketRefs, ticketLabel, notificationText, FILES_MAX, FILE_MAX_BYTES, TOTAL_MAX_BYTES, DESCRIPTION_MAX, type Ticket, type NewTicketInput } from "./domain";
export type { UploadedFile, Actor, TicketFilter } from "./application";

/** Публичный фасад контекста «Обращения»: проблемы и просьбы с формы /support, расшифровка голосовых, статусы, уведомление и закрытие по выкатке. */
export class SupportModule {
  readonly tickets: TicketsService;

  /** Вложение файлом на диске (из бакета — временной копией) для отдачи с Range: видео и звук в Safari. Права проверяет вызывающий. */
  /** Вложение обращения (без файла): права проверяет вызывающий, файл — openAttachment или mybook-files по ключу. */
  async attachment(ticketId: string, attachmentId: string): Promise<SupportAttachment | null> {
    const t = await this.tickets.byId(ticketId);
    return t?.attachments.find((a) => a.id === attachmentId) ?? null;
  }

  /** Файл вложения потоком из хранилища (Range, ETag) — без скачивания на диск сайта. */
  openAttachment(attachment: SupportAttachment, req?: StoredFileRequest): Promise<StoredFile | null> {
    return openStoredFile(attachment.key, req);
  }

  async attachmentFile(ticketId: string, attachmentId: string): Promise<{ path: string; attachment: SupportAttachment } | null> {
    const t = await this.tickets.byId(ticketId);
    const attachment = t?.attachments.find((a) => a.id === attachmentId);
    const path = attachment ? await localPath(attachment.key) : null;
    return path && attachment ? { path, attachment } : null;
  }

  /** AI (расшифровка и суть) — порт контекста «AI-помощник», WhatsApp и переписка клиента — порты контекста «Переписка», звук из видео — ffmpeg сервера. */
  constructor(deps: { clock: Clock; logger: Logger; ai: TicketAi; audio: AudioExtractor; messenger: TicketMessenger; alerts: TicketAlerts; chats: TicketChats; appUrl: string }) {
    this.tickets = new TicketsService(new DrizzleTicketRepository(), { put: putFile, get: getFile }, deps.ai, deps.audio, deps.messenger, deps.alerts, deps.chats, deps.clock, deps.logger, deps.appUrl);
  }
}
