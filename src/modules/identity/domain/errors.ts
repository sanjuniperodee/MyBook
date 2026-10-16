import { contextError } from "@/shared/domain";

/** Совпадают с ключами словаря auth.errors (кроме twoFactorAlreadyOn — он в admin) — текст подставляет слой представления. */
export type IdentityErrorCode = "email" | "password" | "exists" | "phone" | "credentials" | "resetExpired" | "twoFactorCode" | "twoFactorExpired" | "twoFactorAlreadyOn";

export const IdentityError = contextError<IdentityErrorCode>("identity", "IdentityError");
export type IdentityError = InstanceType<typeof IdentityError>;
