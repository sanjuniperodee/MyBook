/**
 * Лимиты полей — без zod и схем: их берут и формы сайта в браузере (мастер книги, редактор обложки, kinds.ts), и
 * контракт (v1/cover.ts). Импорт `@mybook/contracts/limits` не тянет весь контракт в клиентский бандл.
 */
export const COVER_TEXT_MAX = { title: 80, authorName: 60, recordedBy: 80, recipientName: 60, subtitle: 80, namesOnCover: 120, backText: 400 } as const;
/** Пределы конструктора обложки — те же, что в cover-design/parse.ts и photo-frame.ts (без zod, для веба и API). */
export const COVER_DESIGN_LIMITS = {
  layers: 40,
  text: 300,
  name: 40,
  bleed: 0.2,
  minSize: 0.01,
  maxSize: 1.4,
  fontSizeMin: 0.012,
  fontSizeMax: 0.4,
  trackingMin: -0.1,
  trackingMax: 0.8,
  lineHeightMin: 0.7,
  lineHeightMax: 2.5,
  shadowMin: -0.3,
  shadowMax: 0.3,
  outlineMin: 0,
  outlineMax: 0.12,
  strokeMin: 0,
  strokeMax: 0.06,
  borderMin: 0,
  borderMax: 0.05,
  frameZoomMin: 1,
  frameZoomMax: 4,
  frameSlotsMax: 12,
  minDpi: 200,
  ptPerMm: 72 / 25.4,
  historyLimit: 100,
} as const;
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
