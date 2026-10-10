import type { Locale } from "@/i18n/config";
import type { OrderPrintSpec } from "../domain";

/** Что заказу нужно знать о книге (контекст Authoring). */
export interface BookGateway {
  checkoutInfo(bookId: string, userId: string, locale: Locale): Promise<{ status: "draft" | "ordered"; blockingIssue: string | null; estimatedPages: number } | null>;
  /** draft → ordered атомарно; false — книгу уже заказали параллельно. */
  lockForOrder(bookId: string): Promise<boolean>;
  unlock(bookId: string): Promise<void>;
  /** Открыть/закрыть книгу для правок клиентом (по просьбе исправить опечатку). */
  toggleEditing(bookId: string): Promise<"draft" | "ordered">;
}

/** Клиенты и сотрудники (контексты Identity и Access). */
export interface PeopleGateway {
  rememberPhoneIfMissing(userId: string, phone: string): Promise<void>;
  /** Активный сотрудник CRM — подпись для журнала; null, если такого нет. */
  staffLabel(userId: string): Promise<string | null>;
}

/** Договорённость менеджера с клиентом о цене и предоплате (контекст «Продажи»). */
export interface AgreementGateway {
  agreementFor(userId: string): Promise<{ dealId: string; dealNumber: number; agreedTotal: number; prepaid: number } | null>;
}

/** Файлы для типографии (контекст Production). */
export interface PrintFiles {
  prepare(job: { orderId: string; bookId: string; number: number }, opts?: { force?: boolean }): Promise<OrderPrintSpec | null>;
}

/** Выпуск кода сертификата и платёжные настройки. */
export interface PaymentSettings {
  provider(): string;
  currency(): string;
}

export interface CodeGenerator {
  giftCode(): string;
  giftToken(): string;
}
