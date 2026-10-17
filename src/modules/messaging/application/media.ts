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
const MEDIA_UNAVAILABLE = Symbol.for("mybook.media-unavailable");

/** Шлюз недавно не смог скачать этот файл — повторим позже. Проверка — MediaUnavailableError.is() (классы в слоях бандла разные). */
export class MediaUnavailableError extends Error {
  readonly [MEDIA_UNAVAILABLE] = true;
  constructor() {
    super("Шлюз WhatsApp не смог скачать файл — попробуйте позже");
  }
  static is(err: unknown): err is MediaUnavailableError {
    return typeof err === "object" && err !== null && (err as Record<symbol, unknown>)[MEDIA_UNAVAILABLE] === true;
  }
}

/** Сколько не просить шлюз снова скачать вложение, которое он не смог скачать (WhatsApp файл уже не отдаёт). */
export const MEDIA_RETRY_MS = 10 * 60_000;

async function readAll(stream: ReadableStream<Uint8Array>, max: number): Promise<Uint8Array | null> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.length;
    if (size > max) return null;
    chunks.push(chunk);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

export class ChatMediaService {
  /** id сообщения → когда шлюз не смог скачать файл: чат с десятком старых фото не дёргает шлюз на каждом открытии. */
  private readonly failed = new Map<string, number>();

  constructor(
    private readonly conversations: Pick<ConversationRepository, "findById">,
    private readonly messages: MessageMediaStore,
    private readonly gateway: MediaGateway,
    /** WhatsApp сейчас идёт через свой шлюз — его же диалоги, начатые при Wazzup, тоже качаются через шлюз. */
    private readonly viaGowa: () => Promise<boolean>,
    private readonly now: () => number = Date.now,
  ) {}

  async find(messageId: string): Promise<Attachment | null> {
    const message = await this.messages.media(messageId);
    if (!message) return null;
    const conversation = await this.conversations.findById(message.conversationId);
    return conversation ? { message, conversation } : null;
  }

  /** Файл вложения с Content-Type для браузера; null — файла нет и шлюз его не скачает (или ссылка Wazzup — она открывается напрямую). */
  /**
   * range — заголовок Range браузера (перемотка; Safari без него не играет). Шлюз не смог скачать файл — его ошибка,
   * а следующие MEDIA_RETRY_MS по этому сообщению сразу MediaUnavailableError, без запроса к шлюзу.
   */
  async open({ message, conversation }: Attachment, range?: string | null): Promise<MediaFile | null> {
    const saved = gowaMediaPath(message.mediaUrl);
    if (message.mediaUrl && !saved) return null;
    const file = saved ? await this.gateway.file(saved, range) : null;
    if (file) return this.typed(message, file);
    // Файла нет или шлюз его уже удалил — скачать заново по id сообщения.
    if (!gowaDownloadable(conversation, await this.viaGowa(), { ...message, mediaUrl: null })) return null;
    const failedAt = this.failed.get(message.id);
    if (failedAt !== undefined && this.now() - failedAt < MEDIA_RETRY_MS) throw new MediaUnavailableError();
    let path: string;
    try {
      path = await this.gateway.download(message.externalId!, conversation.chatId);
    } catch (err) {
      this.failed.set(message.id, this.now());
      throw err;
    }
    this.failed.delete(message.id);
    await this.messages.saveMediaUrl(message.id, gowaMediaUrl(path));
    const fresh = await this.gateway.file(path, range);
    return fresh ? this.typed(message, fresh) : null;
  }

  private typed(message: MessageMedia, file: MediaFile): MediaFile {
    return { ...file, contentType: gowaMediaType(message.type, file.contentType) };
  }

  /**
   * Файл вложения целиком — для распознавания голосовых и фото моделью продажника (не для браузера). Ссылка Wazzup
   * качается напрямую, файл шлюза — через шлюз. null — файла нет или он больше maxSize.
   */
  async bytes(messageId: string, maxSize = 10_000_000): Promise<{ data: Uint8Array; mime: string } | null> {
    const att = await this.find(messageId);
    if (!att) return null;
    const { message, conversation } = att;
    const saved = gowaMediaPath(message.mediaUrl);
    if (saved) {
      const file = await this.gateway.file(saved).catch(() => null);
      if (file) {
        const data = await readAll(file.body, maxSize).catch(() => null);
        return data ? { data, mime: this.typed(message, file).contentType ?? "" } : null;
      }
    }
    if (message.mediaUrl && /^https?:/i.test(message.mediaUrl)) {
      const res = await fetch(message.mediaUrl, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
      if (res?.ok && res.body) {
        const data = await readAll(res.body, maxSize).catch(() => null);
        return data ? { data, mime: res.headers.get("content-type") ?? "" } : null;
      }
    }
    // Файла нет или шлюз его удалил — скачать заново по id сообщения.
    if (!gowaDownloadable(conversation, await this.viaGowa(), { ...message, mediaUrl: null })) return null;
    try {
      const file = await this.open(att);
      if (!file) return null;
      const data = await readAll(file.body, maxSize).catch(() => null);
      return data ? { data, mime: file.contentType ?? "" } : null;
    } catch (err) {
      if (MediaUnavailableError.is(err)) return null;
      throw err;
    }
  }
}
