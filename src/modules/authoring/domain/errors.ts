import { contextError } from "@/shared/domain";

/** Коды совпадают с ключами словаря api — роуты отдают текст на языке пользователя. */
export type AuthoringErrorCode =
  | "bookNotFound"
  | "bookLocked"
  | "bookHasOrders"
  | "questionNotFound"
  | "questionsLimit"
  | "onlyOwnQuestions"
  | "photoNotFound"
  | "photosPick"
  | "photosLimit"
  | "photosOutdated"
  | "photoEditInvalid"
  | "unknownCover"
  | "unknownInterior"
  | "unknownBackLayout"
  | "unknownFormat"
  | "unknownOccasion"
  | "unknownTocMode"
  | "unknownLanguage"
  | "letterNotFound"
  | "letterInvalid"
  | "letterClosed"
  | "letterPrinted"
  | "letterLimit"
  | "unknownTheme"
  | "outlineNotAllowed"
  | "outlineOutdated"
  | "chaptersLimit"
  | "chapterNotFound"
  // Свои видео и аудио к ответам (infrastructure/answerFiles.ts); HTTP-статусы — STATUS_BY_CODE в src/server/errors.ts.
  | "fileType"
  | "fileTooBig"
  | "fileBusy"
  | "fileLimit"
  | "fileTooLong"
  | "fileQuota"
  | "fileChunk";

export const AuthoringError = contextError<AuthoringErrorCode>("authoring", "AuthoringError");
export type AuthoringError = InstanceType<typeof AuthoringError>;
