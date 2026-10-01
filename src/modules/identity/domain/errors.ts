import { DomainError } from "@/shared/domain";

/** Совпадают с ключами словаря auth.errors — текст подставляет слой представления. */
export type IdentityErrorCode = "email" | "password" | "exists" | "credentials" | "resetExpired" | "twoFactorCode" | "twoFactorExpired" | "twoFactorAlreadyOn" | "tooMany";

export class IdentityError extends DomainError<IdentityErrorCode> {}
