import type { Review } from "./Review";

export interface ReviewRepository {
  nextId(): string;
  byId(id: string): Promise<Review | null>;
  byOrder(orderId: string): Promise<Review | null>;
  /** Вставка или обновление целиком. */
  save(review: Review): Promise<void>;
}
