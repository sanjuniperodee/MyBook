import { contextError } from "@/shared/domain";

/** Коды совпадают с ключами словаря api — роуты отдают текст на языке пользователя. */
export type FeedbackErrorCode = "reviewNotAllowed" | "reviewNotFound" | "reviewInvalid" | "reviewLocked" | "reviewNotPublishable" | "reviewPhotoInvalid";

export const FeedbackError = contextError<FeedbackErrorCode>("feedback", "FeedbackError");
export type FeedbackError = InstanceType<typeof FeedbackError>;
