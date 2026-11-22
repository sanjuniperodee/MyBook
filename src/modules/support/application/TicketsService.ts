import type { Clock, Logger } from "@/shared/application";
import { isClosedStatus, SUPPORT_STATUS_LABELS, type SupportAttachment, type SupportChat, type SupportChatMessage, type SupportCommit, type SupportEvent, type SupportStatus } from "@/shared/domain/support";
import {
  attachmentKind,
  FILE_MAX_BYTES,
  fileExt,
  notificationText,
  SUMMARY_SYSTEM,
  summaryInput,
  SupportError,
  ticketRefs,
  TOTAL_MAX_BYTES,
  TRANSCRIBE_GLOSSARY,
  TRANSCRIBE_SYSTEM,
  validateNew,
  type NewTicketInput,
  type Ticket,
} from "../domain";
import type { AudioExtractor, TicketAi, TicketAlerts, TicketChats, TicketFiles, TicketFilter, TicketMessenger, TicketRepository } from "./ports";

export interface UploadedFile {
  name: string;
  mime: string;
  data: Buffer;
  /** Записано в форме кнопкой «Записать голосовое». */
  recorded?: boolean;
}

/** Кто действует: сотрудник CRM, выкатка или сам человек с формы. */
export interface Actor {
  userId: string | null;
  name: string;
}

/** Сколько записей (голосовые, видео) расшифровываем в обращении без входа; остальные — по кнопке в CRM. */
const ANON_LISTEN_MAX = 6;
/** Звук длиннее ~25 МБ модели не отдаём: такой файл всё равно не пройдёт по размеру запроса. */
const AUDIO_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Обращения: приём с формы, разбор вложений (расшифровка голосовых и видео, суть от AI), статусы из CRM, уведомление
 * в WhatsApp на номер из обращения и закрытие по выкатке коммита «Обращение №N».
 */
export class TicketsService {
  constructor(
    private readonly repo: TicketRepository,
    private readonly files: TicketFiles,
    private readonly ai: TicketAi,
    private readonly audio: AudioExtractor,
    private readonly messenger: TicketMessenger,
    private readonly alerts: TicketAlerts,
    private readonly chats: TicketChats,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly appUrl: string,
  ) {}

  private event(by: string, text: string): SupportEvent {
    return { at: this.clock.now().toISOString(), by, text };
  }

  /** Принять обращение: проверить поля, сохранить файлы, завести запись. Разбор вложений — отдельно (process), после ответа. */
  async create(input: NewTicketInput, uploads: UploadedFile[], actor: Actor): Promise<Ticket> {
    const fields = validateNew(input, uploads.length);
    const total = uploads.reduce((n, f) => n + f.data.length, 0);
    const big = uploads.find((f) => f.data.length > FILE_MAX_BYTES);
    if (big) throw new SupportError("invalid", `Файл «${big.name}» больше ${FILE_MAX_BYTES / 1024 / 1024} МБ — сожмите или пришлите ссылкой в описании`);
    if (total > TOTAL_MAX_BYTES) throw new SupportError("invalid", `Все файлы вместе — больше ${TOTAL_MAX_BYTES / 1024 / 1024} МБ. Отправьте часть, остальное — вторым обращением`);

    const id = this.repo.nextId();
    const attachments: SupportAttachment[] = [];
    for (const [i, f] of uploads.entries()) {
      const name = f.name.replace(/[\\/]/g, "_").slice(0, 120) || `файл-${i + 1}`;
      const attId = `${i + 1}-${Math.random().toString(36).slice(2, 8)}`;
      const key = `support/${id}/${attId}.${fileExt(name, f.mime)}`;
      await this.files.put(key, f.data);
      attachments.push({ id: attId, key, name, mime: f.mime || "application/octet-stream", size: f.data.length, kind: attachmentKind(f.mime, name), ...(f.recorded ? { recorded: true } : {}) });
    }
    const ticket = await this.repo.insert(id, {
      ...fields,
      status: "new",
      attachments,
      chat: null,
      summary: "",
      resolution: "",
      devNote: "",
      commits: [],
      history: [this.event(actor.name || fields.reporterName || "форма", "Обращение создано")],
      createdBy: actor.userId,
      processedAttempts: 0,
      processedAt: null,
      resolvedAt: null,
      notifiedAt: null,
      notifyError: null,
    });
    await this.alerts.created(ticket).catch((err) => this.logger.error("alert", err));
    return ticket;
  }

  /**
   * Разобрать вложения: расшифровать голосовые и звук видео (готовые — пропустить, force — заново), затем суть от AI.
   * Сбой одного файла не мешает остальным: причина пишется во вложение, суть строится по тому, что вышло.
   */
  async process(id: string, opts: { force?: boolean } = {}): Promise<Ticket | null> {
    const t = await this.repo.byId(id);
    if (!t) return null;
    // Обращение с формы без входа: расшифровываем не больше ANON_LISTEN_MAX записей — чужие файлы не должны тратить AI без меры.
    let budget = t.createdBy ? Infinity : ANON_LISTEN_MAX;
    const transcribed = new Map<string, SupportAttachment>();
    for (const a of t.attachments) {
      const listen = a.kind === "audio" || a.kind === "video";
      if (!listen || (a.transcript && !opts.force)) continue;
      if (budget-- <= 0) {
        transcribed.set(a.id, { ...a, transcriptError: "не расшифровано: слишком много записей в одном обращении — «Расшифровать заново» в CRM" });
        continue;
      }
      transcribed.set(a.id, await this.transcribe(a));
    }
    const chatDone = t.chat ? await this.transcribeChat(t.chat, !!opts.force) : null;

    // Расшифровка идёт минутами: за это время сотрудник мог приложить другую переписку или сменить статус. Пишем только
    // результаты расшифровки поверх свежей записи, а не всю запись, прочитанную в начале.
    const fresh = (await this.repo.byId(id)) ?? t;
    const attachments = fresh.attachments.map((a) => transcribed.get(a.id) ?? a);
    const byId = new Map((chatDone?.messages ?? []).map((m) => [m.id, m]));
    const chat = fresh.chat ? { ...fresh.chat, messages: fresh.chat.messages.map((m) => (chatDone && fresh.chat?.conversationId === chatDone.conversationId ? (byId.get(m.id) ?? m) : m)) } : null;
    const withText = { ...fresh, attachments, chat };
    const summary = (await this.ai.brief({ system: SUMMARY_SYSTEM, user: summaryInput(withText) })) ?? fresh.summary;
    await this.repo.update(id, { attachments, chat, summary, processedAttempts: fresh.processedAttempts + 1, processedAt: this.clock.now() });
    return { ...withText, summary };
  }

  /** Голосовые выбранной переписки — своей расшифровкой (Gemini); готовые — пропустить. */
  private async transcribeChat(chat: SupportChat, force: boolean): Promise<SupportChat> {
    const messages: SupportChatMessage[] = [];
    for (const m of chat.messages) {
      if (m.type !== "audio" || (m.transcriptBy && m.transcript && !force)) {
        messages.push(m);
        continue;
      }
      const bytes = await this.chats.mediaBytes(m.id).catch(() => null);
      // Файла уже нет (вложения шлюза чистят) — остаётся расшифровка из чата, если была.
      if (!bytes) {
        messages.push({ ...m, transcriptError: m.transcript ? undefined : "файл голосового в чате недоступен" });
        continue;
      }
      const res = await this.listen(Buffer.from(bytes.data), bytes.mime || "audio/ogg", true);
      messages.push("error" in res ? { ...m, transcriptError: res.error } : { ...m, transcript: res.text, transcriptBy: res.by, transcriptError: undefined });
    }
    return { ...chat, messages };
  }

  /** Звук → текст: видео и непривычные форматы (amr, 3gp, webm с телефона) сначала в ogg; не вышло — как есть (если это звук). */
  private async listen(raw: Buffer, mime: string, isAudio: boolean): Promise<{ text: string; by: string } | { error: string }> {
    const sound = (await this.audio(raw).catch(() => null)) ?? (isAudio ? { data: raw, mime } : null);
    if (!sound) return { error: "не удалось достать звук из видео" };
    if (sound.data.length > AUDIO_MAX_BYTES) return { error: "запись слишком длинная для расшифровки" };
    const res = await this.ai.transcribe({ system: TRANSCRIBE_SYSTEM, glossary: TRANSCRIBE_GLOSSARY, data: Buffer.from(sound.data).toString("base64"), mime: sound.mime });
    return "error" in res ? res : { text: res.text.slice(0, 20_000), by: res.by };
  }

  private async transcribe(a: SupportAttachment): Promise<SupportAttachment> {
    try {
      const res = await this.listen(await this.files.get(a.key), a.mime, a.kind === "audio");
      if ("error" in res) return { ...a, transcript: undefined, transcriptBy: undefined, transcriptError: res.error };
      return { ...a, transcript: res.text, transcriptBy: res.by, transcriptError: undefined };
    } catch (err) {
      this.logger.error("transcribe", err, { key: a.key });
      return { ...a, transcriptError: "файл недоступен" };
    }
  }

  /**
   * Приложить переписку клиента: диалог CRM и выбранные в нём сообщения (копией — чат могут почистить). Пустой список —
   * отвязать. Телефон клиента, если не был указан, берётся из диалога WhatsApp. Дальше — process: расшифровка и суть.
   */
  async linkChat(id: string, conversationId: string | null, messageIds: string[], actor: Actor): Promise<Ticket> {
    const t = await this.repo.byId(id);
    if (!t) throw new SupportError("notFound", "Обращение не найдено");
    if (!conversationId || !messageIds.length) {
      await this.repo.update(id, { chat: null, history: [...t.history, this.event(actor.name, "Переписка отвязана")] });
      return { ...t, chat: null };
    }
    const conv = await this.chats.conversation(conversationId);
    if (!conv) throw new SupportError("notFound", "Диалог не найден");
    const picked = await this.chats.messagesIn(conversationId, messageIds);
    if (!picked.length) throw new SupportError("invalid", "Выберите сообщения этого диалога");
    const old = new Map((t.chat?.conversationId === conversationId ? t.chat.messages : []).map((m) => [m.id, m]));
    const chat: SupportChat = {
      conversationId,
      contact: conv.contactName,
      chatId: conv.chatId,
      messages: picked.map((m) => old.get(m.id) ?? { id: m.id, at: m.createdAt.toISOString(), direction: m.direction, type: m.type, text: m.text.slice(0, 4000), ...(m.transcript ? { transcript: m.transcript, transcriptBy: "whisper" } : {}) }),
    };
    const phone = !t.clientPhone && /^\d{11,15}$/.test(conv.chatId) ? conv.chatId : t.clientPhone;
    await this.repo.update(id, { chat, clientPhone: phone, history: [...t.history, this.event(actor.name, `Приложена переписка с ${conv.contactName || `+${conv.chatId}`}: ${picked.length} сообщ.`)] });
    return { ...t, chat, clientPhone: phone };
  }

  list(filter: TicketFilter) {
    return this.repo.list(filter);
  }

  counts() {
    return this.repo.counts();
  }

  byNumber(n: number) {
    return this.repo.byNumber(n);
  }

  byId(id: string) {
    return this.repo.byId(id);
  }

  /** Файл вложения — права проверяет вызывающий. */
  async file(ticketId: string, attachmentId: string): Promise<{ data: Buffer; attachment: SupportAttachment } | null> {
    const t = await this.repo.byId(ticketId);
    const a = t?.attachments.find((x) => x.id === attachmentId);
    if (!a) return null;
    return { data: await this.files.get(a.key), attachment: a };
  }

  /**
   * Изменить обращение из CRM: статус, что сделали (уходит в уведомлении), заметку. notify — сразу написать человеку
   * (по умолчанию — при переводе в «Исправлено» или «Отклонено»).
   */
  async update(id: string, patch: { status?: SupportStatus; resolution?: string; devNote?: string; notify?: boolean }, actor: Actor): Promise<{ notified: boolean | null }> {
    const t = await this.repo.byId(id);
    if (!t) throw new SupportError("notFound", "Обращение не найдено");
    const history = [...t.history];
    const next: Partial<Ticket> = {};
    if (patch.resolution !== undefined) next.resolution = patch.resolution.trim().slice(0, 4000);
    if (patch.devNote !== undefined) next.devNote = patch.devNote.trim().slice(0, 10_000);
    const statusChanged = patch.status && patch.status !== t.status;
    if (statusChanged && patch.status) {
      next.status = patch.status;
      next.resolvedAt = isClosedStatus(patch.status) ? this.clock.now() : null;
      history.push(this.event(actor.name, `Статус: ${SUPPORT_STATUS_LABELS[t.status]} → ${SUPPORT_STATUS_LABELS[patch.status]}`));
    }
    await this.repo.update(id, { ...next, history });
    const closing = statusChanged && patch.status && isClosedStatus(patch.status);
    if (patch.notify ?? closing) return { notified: await this.notify(id, actor) };
    return { notified: null };
  }

  /** Написать человеку в WhatsApp: номер, статус и что сделали. false — не ушло (причина — в notifyError и истории). */
  async notify(id: string, actor: Actor): Promise<boolean> {
    const t = await this.repo.byId(id);
    if (!t) throw new SupportError("notFound", "Обращение не найдено");
    if (!t.notifyPhone) return false;
    const ok = await this.messenger.send(t.notifyPhone, notificationText(t, this.appUrl)).catch(() => false);
    await this.repo.update(id, {
      notifiedAt: ok ? this.clock.now() : t.notifiedAt,
      notifyError: ok ? null : "WhatsApp не отправил сообщение — проверьте подключение в «Интеграциях»",
      history: [...t.history, this.event(actor.name, ok ? `Уведомление отправлено на +${t.notifyPhone}` : `Уведомление на +${t.notifyPhone} не ушло`)],
    });
    return ok;
  }

  /**
   * Выкатка релиза: коммиты с «Обращение №N» закрывают обращения (кроме отклонённых) и шлют уведомление тем, кто
   * его ещё не получал после этого исправления. Повторная выкатка того же коммита ничего не дублирует.
   */
  async released(input: { release: string; commits: { sha: string; subject: string; body?: string }[] }): Promise<{ number: number; closed: boolean; notified: boolean }[]> {
    const byTicket = new Map<number, SupportCommit[]>();
    const at = this.clock.now().toISOString();
    for (const c of input.commits) {
      for (const n of ticketRefs(`${c.subject}\n${c.body ?? ""}`)) {
        byTicket.set(n, [...(byTicket.get(n) ?? []), { sha: c.sha.slice(0, 40), subject: c.subject.slice(0, 300), release: input.release.slice(0, 80), at }]);
      }
    }
    if (!byTicket.size) return [];
    const actor: Actor = { userId: null, name: "выкатка" };
    const out: { number: number; closed: boolean; notified: boolean }[] = [];
    for (const t of await this.repo.byNumbers([...byTicket.keys()])) {
      const fresh = (byTicket.get(t.number) ?? []).filter((c) => !t.commits.some((x) => x.sha === c.sha));
      if (!fresh.length) continue;
      const close = t.status !== "rejected" && t.status !== "done";
      const history = [...t.history, this.event(actor.name, `Выкачено в ${input.release}: ${fresh.map((c) => `${c.sha.slice(0, 7)} ${c.subject}`).join("; ")}`)];
      if (close) history.push(this.event(actor.name, `Статус: ${SUPPORT_STATUS_LABELS[t.status]} → ${SUPPORT_STATUS_LABELS.done}`));
      await this.repo.update(t.id, { commits: [...t.commits, ...fresh], history, ...(close ? { status: "done" as const, resolvedAt: this.clock.now() } : {}) });
      const notified = close ? await this.notify(t.id, actor) : false;
      out.push({ number: t.number, closed: close, notified });
    }
    return out;
  }
}
