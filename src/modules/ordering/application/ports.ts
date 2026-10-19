import type { Locale } from "@/i18n/config";
import type { AgreementGift } from "@/shared/domain/agreementGifts";
import type { OrderPrintSpec } from "@/shared/domain/orders";
import type { KaspiMethod, KaspiPaymentView } from "../domain";

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
  /** Активный сотрудник CRM — для подписи в журнале; null, если такого нет. */
  activeStaff(userId: string): Promise<{ name: string; email: string } | null>;
}

/** Договорённость менеджера с клиентом о цене и предоплате (контекст «Продажи»). */
export interface AgreementGateway {
  agreementFor(userId: string): Promise<{ dealId: string; dealNumber: number; agreedTotal: number; prepaid: number; deadline: string | null; plan: string | null; /** Что по договорённости бесплатно (упаковка, доставка). */ gifts?: AgreementGift[]; batch?: { index: number; size: number; left: number; agreedLeft: number; prepaidLeft: number; implicit?: boolean } | null; recipient?: string | null } | null>;
  /**
   * Заказ — к сделке договорённости в транзакции оформления: «у сделки есть заказ» сразу видят счета из чата (новый
   * не выставить, оплата старого — «нужен возврат или зачёт»). false — у сделки уже другой заказ.
   */
  attachOrder?(dealId: string, orderId: string): Promise<boolean>;
}

/** Заказ, для которого готовим файлы. */
export interface PrintJob {
  orderId: string;
  bookId: string;
  number: number;
}

/** Файлы для типографии (контекст Production). */
export interface PrintFiles {
  prepare(job: PrintJob, opts?: { force?: boolean }): Promise<OrderPrintSpec | null>;
  /** После оплаты: готовит файлы заранее; сбой не бросается, а пишется в лог. spec — параметры собранного сейчас пакета для печати. */
  warmUp(job: PrintJob): Promise<{ status: "rendered" | "cached" | "failed"; spec: OrderPrintSpec | null }>;
}

/** Что напечатано на подарочном сертификате. */
export interface GiftPdfData {
  /** Язык сертификата. */
  locale: Locale;
  number: number;
  code: string;
  plan: string;
  amount: number;
  buyerName: string;
  recipientName: string;
  message: string;
  validUntil: Date;
}

/** PDF подарочного сертификата (контекст Production). */
export interface GiftPdfRenderer {
  render(data: GiftPdfData): Promise<Buffer>;
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

/** Kaspi Pay через kaspi-pos-automation (сеть, сессия кассира). Нет связи с Kaspi — OrderingError("kaspiUnavailable"). */
export interface KaspiGateway {
  /** Кассир подключён (есть сессия) — можно выставлять счета. */
  connected(): Promise<boolean>;
  createInvoice(phone: string, amount: number, comment: string): Promise<KaspiPaymentView>;
  createQr(amount: number): Promise<KaspiPaymentView>;
  details(externalId: string, method: KaspiMethod): Promise<KaspiPaymentView | null>;
  cancel(externalId: string): Promise<void>;
}

/** Сессия кассира Kaspi Pay (после входа по SMS-коду). Секреты хранятся зашифрованными в настройках. */
export interface KaspiSession {
  tokenSn: string;
  vtokenSecret: string;
  profileId: number;
  organizationId: number;
  orgName: string;
  phone: string;
}

/** Где лежат настройки Kaspi (контекст «Рабочее пространство», «Интеграции»). */
export interface KaspiConfigStore {
  /**
   * shared — сессия кассира общая с другим проектом на том же kaspi-pos и задана на сервере (KASPI_TOKEN_SN и др.):
   * вход по SMS здесь запрещён — он вытеснил бы сессию у другого проекта (Kaspi держит одну сессию на кассира).
   */
  config(): Promise<{ enabled: boolean; apiUrl: string; session: KaspiSession | null; shared: boolean }>;
  saveSession(session: KaspiSession | null, actorId: string | null): Promise<void>;
  setEnabled(enabled: boolean, actorId: string | null): Promise<void>;
  /** Адрес сервиса kaspi-pos-automation, указанный в «Интеграциях». */
  saveApiUrl(apiUrl: string, actorId: string | null): Promise<void>;
  /** Секрет подписи вебхуков kaspi-pos (создаётся при первом обращении). */
  webhookSecret(): Promise<string>;
}

/** Вход кассира в kaspi-pos-automation: номер → SMS-код → сессия. */
export interface KaspiAuthGateway {
  start(phone: string): Promise<{ processId: string }>;
  verify(processId: string, otp: string): Promise<KaspiSession>;
  /** Сессия ещё принимается Kaspi (запрос к Kaspi). */
  sessionActive(): Promise<boolean>;
  /** Сервис kaspi-pos отвечает по указанному адресу (без запроса к Kaspi). */
  reachable(): Promise<boolean>;
}
