export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

/**
 * Чем кончилась отправка (automation-d9): sent — SMTP принял письмо; skipped_stub — адрес-заглушка клиента без почты
 * (@phone.invalid), письмо не отправлялось; unconfigured — SMTP не настроен, письмо только в логе; failed — ошибка SMTP.
 * Отметки «письмо отправлено» в ленте и журнале ставятся только при sent.
 */
export type MailResult = "sent" | "skipped_stub" | "unconfigured" | "failed";

/**
 * Порт отправки писем. send не бросает исключений: почта не должна ломать основной сценарий
 * (оформление заказа, регистрацию). Без настроенного транспорта письмо пишется в лог.
 */
export interface Mailer {
  /** Транспорт настроен (иначе письма только пишутся в лог). */
  configured(): Promise<boolean>;
  send(to: string, subject: string, html: string, attachments?: MailAttachment[]): Promise<MailResult>;
}
