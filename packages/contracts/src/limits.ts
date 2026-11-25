/**
 * Лимиты полей — без zod и схем: их берут и формы сайта в браузере (мастер книги, редактор обложки, kinds.ts), и
 * контракт (v1/cover.ts). Импорт `@mybook/contracts/limits` не тянет весь контракт в клиентский бандл.
 */
export const COVER_TEXT_MAX = { title: 80, authorName: 60, recordedBy: 80, recipientName: 60, subtitle: 80, namesOnCover: 120, backText: 400 } as const;
/** Письма близких: текст приглашения, подпись, кем приходится, текст письма. */
export const LETTER_MAX = { inviteText: 500, authorName: 80, relation: 80, text: 8000 } as const;
/** Отзыв о книге: текст, имя, город. */
export const REVIEW_MAX = { text: 2000, authorName: 40, city: 40 } as const;
/** Свои видео/аудио и ссылки по QR в ответе (сверяет tests/api-v1-answer-files.test.ts с lib/book/answer-files и answer-media). */
export const ANSWER_MEDIA_LIMITS = {
  maxMedia: 8,
  titleMax: 90,
  urlMax: 600,
  chunkBytes: 8 * 1024 * 1024,
  maxSourceBytes: 1024 * 1024 * 1024,
  maxVideoSec: 10 * 60,
  maxAudioSec: 30 * 60,
  maxFilesPerBook: 40,
} as const;
