import "server-only";
import type { z } from "zod";
import type { WebBookHubResponse, WebBookPhotosPage, WebBookRow, WebOrderDetailResponse, WebSessionUser } from "@mybook/contracts";
import type { Messages } from "@/i18n/messages";
import { nowMs } from "@/lib/dates";
import { deadlineFor, getOccasion, parseDay } from "@/lib/occasions";
import type { PhotoPlace } from "@/lib/book/photo-place";
import type { BookRow } from "@/modules/authoring";
import type { CurrentUser } from "@/modules/identity";

/**
 * Ответы API v1 → значения страниц веба (ADR 0013: у веба нет кода бэкенда, только эти чистые преобразования).
 */
type WebSessionUserDto = z.output<typeof WebSessionUser>;
type WebBookRowDto = z.output<typeof WebBookRow>;
type WebBookHubDto = z.output<typeof WebBookHubResponse>;
export type WebBookPhotosPageDto = z.output<typeof WebBookPhotosPage>;
export type WebOrderDetailResponseDto = z.output<typeof WebOrderDetailResponse>;

/** Сколько ответов считаем «полноценной книгой» для расчёта темпа (как DeadlineBanner). */
const GOOD_BOOK_ANSWERS = 30;

const fromIsoOrNull = (v: string | null): Date | null => (v ? new Date(v) : null);

/** Восстановление `CurrentUser` из безопасного DTO сессии API v1 (без передачи секретов по сети). */
export function fromWebSessionUser(dto: WebSessionUserDto): CurrentUser {
  return {
    id: dto.id,
    email: dto.email,
    passwordHash: "",
    name: dto.name,
    phone: dto.phone,
    role: dto.role,
    tags: dto.tags,
    lastSeenAt: fromIsoOrNull(dto.lastSeenAt),
    remindedAt: fromIsoOrNull(dto.remindedAt),
    emailOptOut: dto.emailOptOut,
    locale: dto.locale,
    source: dto.source,
    crmRoleId: dto.crmRoleId,
    managerId: dto.managerId,
    sipExtension: dto.sipExtension,
    notifyPrefs: dto.notifyPrefs,
    onShift: dto.onShift,
    extraPhones: dto.extraPhones,
    customFields: dto.customFields as CurrentUser["customFields"],
    staffDisabled: dto.staffDisabled,
    totpSecret: dto.hasTotpSecret ? "[redacted]" : null,
    totpEnabledAt: fromIsoOrNull(dto.totpEnabledAt),
    totpBackup: Array<string>(dto.totpBackupCount).fill(""),
    deletedAt: fromIsoOrNull(dto.deletedAt),
    purgedAt: fromIsoOrNull(dto.purgedAt),
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
  };
}

export const entriesToPlacePairs = (entries: readonly { id: string; place: PhotoPlace }[]): [string, PhotoPlace][] =>
  entries.map((e) => [e.id, e.place]);

export function fromWebBookRow(dto: WebBookRowDto): BookRow {
  return {
    ...dto,
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
  };
}

/** Срок к празднику для обзора книги — те же строки, что DeadlineBanner. */
export function buildHubDeadline(occasion: string | null, occasionDate: string | null, answered: number, m: Messages): WebBookHubDto["deadline"] {
  const o = getOccasion(occasion);
  if (!o || !occasionDate) return null;
  const c = m.common;
  const dl = deadlineFor(occasionDate, new Date(nowMs()));
  if (dl.state === "past") return null;
  const left = Math.max(0, GOOD_BOOK_ANSWERS - answered);
  const perDay = left && dl.daysToOrder > 0 ? Math.ceil(left / dl.daysToOrder) : 0;
  const tone = dl.state === "relaxed" ? "calm" : dl.state === "soon" ? "warm" : "hot";
  const line =
    dl.state === "digital"
      ? c.deadline.digital
      : dl.state === "premium"
        ? c.deadline.premium(dl.orderByPremium)
        : `${c.deadline.orderBy(dl.orderBy, dl.daysToOrder)}${perDay ? c.deadline.pace(perDay) : ""}`;
  return {
    days: dl.daysToTarget,
    daysShort: c.daysShort,
    tone,
    headline: c.deadline.headline(c.occasions[o.id].label, parseDay(occasionDate), dl.daysToTarget),
    line,
    icon: dl.state === "digital" ? null : dl.state === "premium" ? "zap" : "clock",
    changeLabel: c.deadline.changeDate,
  };
}
