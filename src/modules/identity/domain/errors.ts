import { contextError } from "@/shared/domain";

/** Совпадают с ключами словаря auth.errors — текст подставляет слой представления. */
export type IdentityErrorCode = "email" | "password" | "exists" | "phone" | "credentials" | "resetExpired" | "twoFactorCode" | "twoFactorExpired" | "twoFactorAlreadyOn" | "tooMany";

export const IdentityError = contextError<IdentityErrorCode>("identity", "IdentityError");
export type IdentityError = InstanceType<typeof IdentityError>;
