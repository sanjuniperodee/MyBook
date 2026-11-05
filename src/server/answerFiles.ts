import "server-only";
import { answerFiles } from "@/modules/authoring";
import { ensureCatalog } from "@/server/catalog";

/**
 * Свои видео и аудио к ответам — обёртка над модулем authoring (infrastructure/answerFiles.ts) для роутов, планировщика
 * и container: те же имена, что были здесь до переноса (ADR 0009 P2: src/server в БД не ходит). Модуль не знает о
 * каталоге в src/server — свежий каталог перед расчётом минут подставляется отсюда.
 */
answerFiles.setCatalogRefresh(ensureCatalog);

export type PublicAnswerFile = answerFiles.PublicAnswerFile;
export type MediaPurchase = answerFiles.MediaPurchase;

export const {
  sourceKey,
  mediaKey,
  posterKey,
  fileDirKey,
  mediaMime,
  mediaPath,
  posterPath,
  fileView,
  newFileToken,
  bookUsage,
  bookFileQuota,
  listBookFiles,
  findBookFile,
  startUpload,
  appendChunk,
  finishUpload,
  removeFile,
  sweepAbandonedUploads,
  findByToken,
  publicFile,
  mediaPackOffers,
  createMediaPurchase,
  findMediaPurchase,
  confirmMediaPurchase,
} = answerFiles;
