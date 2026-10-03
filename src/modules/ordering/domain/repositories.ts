import type { GiftCard } from "./GiftCard";
import type { Order } from "./Order";
import type { PromoCode } from "./PromoCode";

/** Порты хранения. Реализации — в infrastructure; домен о SQL не знает. */
export interface OrderRepository {
  /** Идентичность нового заказа: uuid и номер из последовательности. */
  nextIdentity(): Promise<{ id: string; number: number }>;
  findById(id: string): Promise<Order | null>;
  findByNumber(number: number): Promise<Order | null>;
  /** Заказ клиента (чужой — как будто не существует). */
  findOwned(id: string, userId: string): Promise<Order | null>;
  hasOtherActiveOrders(bookId: string, exceptOrderId: string): Promise<boolean>;
  /** Клиент уже покупал (оплаченный и не отменённый заказ) — для кодов «только на первую книгу». */
  hasPaidOrders(userId: string): Promise<boolean>;
  add(order: Order): Promise<void>;
  save(order: Order): Promise<void>;
}

export interface PromoCodeRepository {
  nextId(): string;
  findByCode(code: string): Promise<PromoCode | null>;
  findById(id: string): Promise<PromoCode | null>;
  /** Код-приглашение, который клиент раздаёт друзьям. */
  findByOwner(ownerId: string): Promise<PromoCode | null>;
  /** Атомарно занять одно использование (условие проверяется в БД — гонки двух заказов исключены). */
  tryReserve(id: string, now: Date): Promise<boolean>;
  release(code: string): Promise<void>;
  /** Сохранить новый код; false — такой код уже есть. */
  add(promo: PromoCode): Promise<boolean>;
  save(promo: PromoCode): Promise<void>;
}

export interface GiftCardRepository {
  nextIdentity(): Promise<{ id: string; number: number }>;
  findById(id: string): Promise<GiftCard | null>;
  findByNumber(number: number): Promise<GiftCard | null>;
  findByToken(token: string): Promise<GiftCard | null>;
  findByPromoId(promoId: string): Promise<GiftCard | null>;
  /** Оплаченные сертификаты, которые пора отправить получателю. */
  findDueForDelivery(today: string, limit: number): Promise<GiftCard[]>;
  /** Блокирует строку до конца транзакции (подтверждение оплаты из двух мест сразу). */
  lockById(id: string): Promise<GiftCard | null>;
  add(gift: GiftCard): Promise<void>;
  save(gift: GiftCard): Promise<void>;
}
