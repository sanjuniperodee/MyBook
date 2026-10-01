import { domainEvent, type DomainEvent } from "@/shared/domain";

export type UserRegistered = DomainEvent<"identity.user_registered", { userId: string; email: string; name: string }>;
export type PasswordChanged = DomainEvent<"identity.password_changed", { userId: string; viaReset: boolean }>;
export type TwoFactorEnabled = DomainEvent<"identity.two_factor_enabled", { userId: string }>;
export type TwoFactorDisabled = DomainEvent<"identity.two_factor_disabled", { userId: string; byAdmin: boolean }>;

export type IdentityEvent = UserRegistered | PasswordChanged | TwoFactorEnabled | TwoFactorDisabled;

export const IdentityEvents = {
  registered: (p: UserRegistered["payload"]): UserRegistered => domainEvent("identity.user_registered", p),
  passwordChanged: (p: PasswordChanged["payload"]): PasswordChanged => domainEvent("identity.password_changed", p),
  twoFactorEnabled: (p: TwoFactorEnabled["payload"]): TwoFactorEnabled => domainEvent("identity.two_factor_enabled", p),
  twoFactorDisabled: (p: TwoFactorDisabled["payload"]): TwoFactorDisabled => domainEvent("identity.two_factor_disabled", p),
};
