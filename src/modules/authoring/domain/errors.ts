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
  | "unknownCover"
  | "unknownTypography"
  | "unknownFormat"
  | "unknownOccasion"
  | "unknownLanguage"
  | "letterNotFound"
  | "letterInvalid"
  | "letterClosed"
  | "letterPrinted"
  | "letterLimit";

export const AuthoringError = contextError<AuthoringErrorCode>("authoring", "AuthoringError");
export type AuthoringError = InstanceType<typeof AuthoringError>;
