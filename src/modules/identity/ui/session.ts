import type { z } from "zod";
import type { Session as SessionDto, User as UserDto, WebSessionUser } from "@mybook/contracts";
import { isLocale } from "@/i18n/config";

/**
 * Отображение пользователя и сессии для API v1 — общий чистый слой для mybook-api и бэкенда на Nest (ADR 0014).
 * Не содержит секретов (passwordHash, totpSecret, totpBackup) и не зависит от БД и Next.
 */

/** Что клиенту API нужно знать о пользователе — общее у агрегата User (вход) и строки сессии (me). */
export interface UserView {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  locale: string;
  isStaff: boolean;
}

/** Строка пользователя из сессии (структурно совпадает с CurrentUser / users.$inferSelect). */
export interface SessionUserRecord {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  role: string;
  tags: unknown;
  lastSeenAt: Date | string | null;
  remindedAt: Date | string | null;
  emailOptOut: boolean;
  locale: string;
  source: Record<string, string> | null;
  crmRoleId: string | null;
  managerId: string | null;
  sipExtension: string | null;
  notifyPrefs: Record<string, unknown> | null;
  onShift: boolean | null;
  extraPhones: unknown;
  customFields: unknown;
  staffDisabled: boolean;
  totpEnabledAt: Date | string | null;
  totpSecret: string | null;
  totpBackup: unknown;
  deletedAt: Date | string | null;
  purgedAt: Date | string | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
}

export type WebSessionUserDto = z.output<typeof WebSessionUser>;

/** Действующий сотрудник: роль admin и не отключён. */
export function isStaffUser(u: Pick<SessionUserRecord, "role" | "staffDisabled"> | null | undefined): boolean {
  return !!u && u.role === "admin" && !u.staffDisabled;
}

export const toUserDto = (u: UserView): z.output<typeof UserDto> => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  locale: u.locale === "kk" ? "kk" : "ru",
  isStaff: u.isStaff,
});

export const sessionRowToUserView = (u: Pick<SessionUserRecord, "id" | "name" | "email" | "phone" | "locale" | "role" | "staffDisabled">): UserView => ({
  id: u.id,
  name: u.name ?? "",
  email: u.email,
  phone: u.phone,
  locale: u.locale,
  isStaff: isStaffUser(u),
});

export const toSessionDto = (s: { token: string; expiresAt: Date; user: UserView }): z.output<typeof SessionDto> => ({
  token: s.token,
  expiresAt: s.expiresAt.toISOString(),
  user: toUserDto(s.user),
});

const toIsoOrNull = (d: Date | string | null | undefined): string | null =>
  d instanceof Date ? d.toISOString() : typeof d === "string" ? d : null;

const toIsoOrEpoch = (d: Date | string | null | undefined): string =>
  toIsoOrNull(d) ?? new Date(0).toISOString();

/** Безопасная проекция пользователя БД → DTO сессии веба без секретов (passwordHash, totpSecret, totpBackup). */
export function toWebSessionUser(u: SessionUserRecord): WebSessionUserDto {
  return {
    id: u.id,
    email: u.email,
    name: u.name ?? "",
    phone: u.phone ?? null,
    role: u.role === "admin" ? "admin" : "user",
    tags: Array.isArray(u.tags) ? (u.tags as string[]) : [],
    lastSeenAt: toIsoOrNull(u.lastSeenAt),
    remindedAt: toIsoOrNull(u.remindedAt),
    emailOptOut: Boolean(u.emailOptOut),
    locale: isLocale(u.locale) ? u.locale : "ru",
    source: u.source && typeof u.source === "object" ? u.source : null,
    crmRoleId: u.crmRoleId ?? null,
    managerId: u.managerId ?? null,
    sipExtension: u.sipExtension ?? null,
    notifyPrefs: u.notifyPrefs && typeof u.notifyPrefs === "object" ? u.notifyPrefs : {},
    onShift: u.onShift ?? true,
    extraPhones: Array.isArray(u.extraPhones) ? (u.extraPhones as string[]) : [],
    customFields: u.customFields && typeof u.customFields === "object" ? (u.customFields as Record<string, unknown>) : {},
    staffDisabled: Boolean(u.staffDisabled),
    totpEnabledAt: toIsoOrNull(u.totpEnabledAt),
    hasTotpSecret: Boolean(u.totpSecret),
    totpBackupCount: Array.isArray(u.totpBackup) ? u.totpBackup.length : 0,
    deletedAt: toIsoOrNull(u.deletedAt),
    purgedAt: toIsoOrNull(u.purgedAt),
    createdAt: toIsoOrEpoch(u.createdAt),
    updatedAt: toIsoOrEpoch(u.updatedAt),
  };
}
