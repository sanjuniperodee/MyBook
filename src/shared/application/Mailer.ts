export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

/**
 * Порт отправки писем. send не бросает исключений: почта не должна ломать основной сценарий
 * (оформление заказа, регистрацию). Без настроенного транспорта письмо пишется в лог.
 */
export interface Mailer {
  /** Транспорт настроен (иначе письма только пишутся в лог). */
  configured(): Promise<boolean>;
  send(to: string, subject: string, html: string, attachments?: MailAttachment[]): Promise<void>;
}
