import type { Locale } from "@/i18n/config";
import type { ThemeOnLanguage } from "../domain";

/** Банк вопросов и тем (контент, а не БД). */
export interface ThemeCatalog {
  get(themeId: string, language: Locale): ThemeOnLanguage;
  isTheme(themeId: string): boolean;
}

/** Обработка загруженных фото: нормализация, превью, поворот. */
export interface ImageProcessor {
  readonly maxUploadBytes: number;
  process(input: Buffer): Promise<{ full: Buffer; thumb: Buffer; width: number; height: number }>;
  rotate(full: Buffer, thumb: Buffer): Promise<{ full: Buffer; thumb: Buffer }>;
}

export interface FileStore {
  get(key: string): Promise<Buffer>;
  put(key: string, data: Buffer): Promise<void>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
}

/** Есть ли у книги заказы (контекст Ordering) — такую книгу удалить нельзя. */
export interface OrdersLookup {
  bookHasOrders(bookId: string): Promise<boolean>;
}

export interface IdGenerator {
  uuid(): string;
  inviteToken(): string;
  revision(): string;
}
