import { gowaDownloadable, gowaMediaPath, gowaMediaType, gowaMediaUrl, type Conversation } from "../domain";
import type { ConversationRepository, MediaFile, MediaGateway, MessageMedia, MessageMediaStore } from "./ports";

/** Вложение и его диалог: по ответственному диалога роут проверяет, видит ли его сотрудник. */
export interface Attachment {
  message: MessageMedia;
  conversation: Conversation;
}

/**
 * Вложения WhatsApp в CRM: файл открывается по id сообщения, путь шлюза в браузер не попадает. Сохранённый файл
 * шлюза отдаётся сразу; вложение без файла (история из хранилища шлюза) шлюз скачивает у WhatsApp, и путь
 * запоминается в сообщении — второй раз файл не качается.
 */
export class ChatMediaService {
  constructor(
    private readonly conversations: Pick<ConversationRepository, "findById">,
    private readonly messages: MessageMediaStore,
    private readonly gateway: MediaGateway,
    /** WhatsApp сейчас идёт через свой шлюз — его же диалоги, начатые при Wazzup, тоже качаются через шлюз. */
    private readonly viaGowa: () => Promise<boolean>,
  ) {}

  async find(messageId: string): Promise<Attachment | null> {
    const message = await this.messages.media(messageId);
    if (!message) return null;
    const conversation = await this.conversations.findById(message.conversationId);
    return conversation ? { message, conversation } : null;
  }

  /** Файл вложения с Content-Type для браузера; null — файла нет и шлюз его не скачает (или ссылка Wazzup — она открывается напрямую). */
  async open({ message, conversation }: Attachment): Promise<MediaFile | null> {
    const saved = gowaMediaPath(message.mediaUrl);
    if (message.mediaUrl && !saved) return null;
    const file = saved ? await this.gateway.file(saved) : null;
    if (file) return this.typed(message, file);
    // Файла нет или шлюз его уже удалил — скачать заново по id сообщения.
    if (!gowaDownloadable(conversation, await this.viaGowa(), { ...message, mediaUrl: null })) return null;
    const path = await this.gateway.download(message.externalId!, conversation.chatId);
    await this.messages.saveMediaUrl(message.id, gowaMediaUrl(path));
    const fresh = await this.gateway.file(path);
    return fresh ? this.typed(message, fresh) : null;
  }

  private typed(message: MessageMedia, file: MediaFile): MediaFile {
    return { ...file, contentType: gowaMediaType(message.type, file.contentType) };
  }
}
