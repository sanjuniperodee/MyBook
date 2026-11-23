/**
 * Файл хранилища потоком для отдачи браузеру (storage.openStoredFile): без чтения целиком в память, с одним диапазоном
 * Range и ETag. Тело есть только у 200 и 206.
 */
export type StoredFile = {
  status: 200 | 206 | 304 | 416;
  body: ReadableStream<Uint8Array> | null;
  /** Полный размер файла (для 304 из бакета может быть неизвестен). */
  size?: number;
  contentLength?: number;
  contentRange?: string;
  etag?: string;
};

/** Заголовки запроса браузера, которые уходят в хранилище: Range (один диапазон) и If-None-Match. */
export type StoredFileRequest = { range?: string | null; ifNoneMatch?: string | null };

/** Открыть файл хранилища потоком по ключу; null — файла нет. */
export type OpenStoredFile = (key: string, req?: StoredFileRequest) => Promise<StoredFile | null>;
