import { DomainError } from "@/shared/domain";

export type AccessErrorCode =
  | "forbidden"
  | "roleNotFound"
  | "staffNotFound"
  | "ownerOnly"
  | "lastOwner"
  | "selfChange"
  | "systemRole"
  | "roleInUse"
  | "ownerRoleImmutable"
  | "keepTeamManage"
  | "extensionTaken"
  | "invalidIpRules"
  | "selfLockout"
  | "twoFactorFirst";

/** Нарушение правил доступа. message — текст для сотрудника (CRM на русском). */
export class AccessError extends DomainError<AccessErrorCode> {}
