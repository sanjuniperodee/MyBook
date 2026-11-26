import "server-only";
import type { z } from "zod";
import type {
  WebDealAgreement,
  WebHealth,
  WebInviteData,
  WebResetInfo,
  WebSessionUser,
  WebShelfBook,
  WebShelfData,
} from "@mybook/contracts";
import { isLocale, type Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import { registrationOpen, site } from "@/config/site";
import { BLANK_READY_WORDS, bookKind } from "@/lib/content/kinds";
import { getTheme } from "@/lib/content/themes";
import { formatDate, nowMs } from "@/lib/dates";
import { deadlineFor, getOccasion } from "@/lib/occasions";
import { startBookInput, type createBookSchema } from "@/lib/book/create-book-schema";
import type { CurrentUser } from "@/modules/identity";
import type { DeletionPreview } from "./account-deletion";
import type { ShelfBook } from "./shelf";

/**
 * Мост легаси `local()` фолбэков (ADR 0012, A5 — душитель):
 * НИКАКИХ статических top-level импортов `./container`, `pg` или `@/modules/*`.
 * На Vercel без `DATABASE_URL` (`webApiOnly() === true`) эти функции не вызываются и модуль БД не загружается.
 */

type WebSessionUserDto = z.output<typeof WebSessionUser>;
type WebShelfBookDto = z.output<typeof WebShelfBook>;
type WebShelfDataDto = z.output<typeof WebShelfData>;
type WebDealAgreementDto = z.output<typeof WebDealAgreement>;
type WebResetInfoDto = z.output<typeof WebResetInfo>;
type WebInviteDataDto = z.output<typeof WebInviteData>;
type WebHealthDto = z.output<typeof WebHealth>;

const NEXT_SECTION_LOOKUP = 6;

const toIsoOrNull = (d: Date | string | null | undefined): string | null =>
  d instanceof Date ? d.toISOString() : typeof d === "string" ? d : null;

const toIsoOrEpoch = (d: Date | string | null | undefined): string =>
  toIsoOrNull(d) ?? new Date(0).toISOString();

const fromIsoOrNull = (v: string | null): Date | null => (v ? new Date(v) : null);

/** Безопасная проекция пользователя БД → DTO сессии без секретов (passwordHash, totpSecret, totpBackup). */
export function toWebSessionUser(u: CurrentUser): WebSessionUserDto {
  return {
    id: u.id,
    email: u.email,
    name: u.name ?? "",
    phone: u.phone ?? null,
    role: u.role === "admin" ? "admin" : "user",
    tags: Array.isArray(u.tags) ? u.tags : [],
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
    extraPhones: Array.isArray(u.extraPhones) ? u.extraPhones : [],
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

export async function localCurrentUserByToken(token: string): Promise<CurrentUser | null> {
  const { container } = await import("./container");
  const identity = container().identity;
  const now = new Date();
  const user = await identity.queries.userBySession(identity.tokens.hash(token), now);
  if (user && (!user.lastSeenAt || now.getTime() - user.lastSeenAt.getTime() > 10 * 60_000)) {
    void identity.queries.touch(user.id, now).catch(() => {});
  }
  return user;
}

export async function localSessionUserDto(token: string): Promise<WebSessionUserDto | null> {
  const user = await localCurrentUserByToken(token);
  return user ? toWebSessionUser(user) : null;
}

export async function localLogout(token: string | undefined): Promise<void> {
  const { container } = await import("./container");
  await container().identity.auth.logout(token);
}

// ─── Вход, регистрация, 2FA, сброс пароля ────────────────────────────────────────────────────────────────────────

export type LocalRegisterResult =
  | { ok: true; token: string; expiresAt: Date }
  | { ok: false; error: string; field?: "email" | "password" };

export async function localRegister(input: {
  name: string;
  email: string;
  password: string;
  locale: Locale;
  source: Record<string, string> | null;
  registrationClosedText: string;
}): Promise<LocalRegisterResult> {
  const [{ ensureCatalog }, { container }, { actionError }, { IdentityError }] = await Promise.all([
    import("./catalog"),
    import("./container"),
    import("./errors"),
    import("@/modules/identity/domain"),
  ]);
  await ensureCatalog();
  if (!registrationOpen()) return { ok: false, error: input.registrationClosedText };
  try {
    const { token, expiresAt } = await container().identity.auth.register({
      name: input.name,
      email: input.email,
      password: input.password,
      locale: input.locale,
      source: input.source,
    });
    return { ok: true, token, expiresAt };
  } catch (err) {
    const error = await actionError(err, IdentityError);
    if (error === null) throw err;
    const field = IdentityError.is(err) ? (err.code === "exists" || err.code === "email" ? "email" : err.code === "password" ? "password" : undefined) : undefined;
    return { ok: false, error, field };
  }
}

export type LocalLoginResult =
  | { kind: "session"; token: string; expiresAt: Date }
  | { kind: "second_factor"; userId: string }
  | { kind: "error"; error: string };

export async function localLogin(input: { login: string; password: string; locale: Locale }): Promise<LocalLoginResult> {
  const [{ container }, { actionError }, { IdentityError }] = await Promise.all([
    import("./container"),
    import("./errors"),
    import("@/modules/identity/domain"),
  ]);
  try {
    const result = await container().identity.auth.login({ login: input.login, password: input.password, locale: input.locale });
    if (result.kind === "second_factor") return { kind: "second_factor", userId: result.userId };
    return { kind: "session", token: result.token, expiresAt: result.expiresAt };
  } catch (err) {
    const error = await actionError(err, IdentityError);
    if (error === null) throw err;
    return { kind: "error", error };
  }
}

export type LocalSecondFactorResult =
  | { ok: true; token: string; expiresAt: Date }
  | { ok: false; error: string; field?: "code" };

export async function localCompleteSecondFactor(input: {
  userId: string;
  code: string;
  locale: Locale;
}): Promise<LocalSecondFactorResult> {
  const [{ container }, { actionError }, { IdentityError }] = await Promise.all([
    import("./container"),
    import("./errors"),
    import("@/modules/identity/domain"),
  ]);
  try {
    const { token, expiresAt } = await container().identity.auth.completeSecondFactor(input.userId, input.code, input.locale);
    return { ok: true, token, expiresAt };
  } catch (err) {
    const error = await actionError(err, IdentityError);
    if (error === null) throw err;
    return { ok: false, error, field: IdentityError.is(err) && err.code === "twoFactorCode" ? "code" : undefined };
  }
}

export async function localForgotPassword(input: { email: string; locale: Locale }): Promise<{ ok: true }> {
  const { container } = await import("./container");
  await container().identity.auth.requestPasswordReset(input.email, input.locale);
  return { ok: true };
}

export async function localResetInfo(token: string): Promise<WebResetInfoDto> {
  const { container } = await import("./container");
  const c = container();
  const [info, digits] = await Promise.all([
    c.identity.auth.linkInfo(token),
    c.marketing.service.shopWhatsapp().catch(() => site.contacts.whatsapp.replace(/\D/g, "")),
  ]);
  return {
    valid: Boolean(info?.valid),
    purpose: info?.purpose ?? null,
    shopWhatsappDigits: digits,
  };
}

export type LocalResetCompleteResult =
  | { kind: "session"; token: string; expiresAt: Date }
  | { kind: "second_factor"; userId: string }
  | { kind: "error"; error: string; expired?: boolean };

export async function localResetComplete(input: {
  token: string;
  password: string;
  accessExpiredText: string;
}): Promise<LocalResetCompleteResult> {
  const [{ container }, { actionError }, { IdentityError }] = await Promise.all([
    import("./container"),
    import("./errors"),
    import("@/modules/identity/domain"),
  ]);
  const auth = container().identity.auth;
  const access = (await auth.linkInfo(input.token))?.purpose === "access";
  try {
    if (access) {
      const session = await auth.redeemAccessLink(input.token, input.password);
      return { kind: "session", token: session.token, expiresAt: session.expiresAt };
    }
    const result = await auth.resetPassword(input.token, input.password);
    if (result.kind === "second_factor") return { kind: "second_factor", userId: result.userId };
    return { kind: "session", token: result.token, expiresAt: result.expiresAt };
  } catch (err) {
    if (access && IdentityError.is(err) && err.code === "resetExpired") {
      return { kind: "error", error: input.accessExpiredText, expired: true };
    }
    const error = await actionError(err, IdentityError);
    if (error === null) throw err;
    return { kind: "error", error };
  }
}

// ─── Аккаунт и настройки ─────────────────────────────────────────────────────────────────────────────────────────

export async function localUpdateProfile(userId: string, name: string, phone: string | null): Promise<void> {
  const { container } = await import("./container");
  await container().identity.accounts.updateProfile(userId, name, phone);
}

export async function localSetReminders(userId: string, on: boolean): Promise<void> {
  const { container } = await import("./container");
  await container().notifications.subscriptions.setReminders(userId, on);
}

export async function localChangePassword(input: {
  userId: string;
  current: string;
  next: string;
  sessionToken: string | null;
  errors: { short: string; wrong: string };
}): Promise<{ ok: true } | { ok: false; error: string; field?: "current" | "next" }> {
  const [{ container }, { IdentityError }] = await Promise.all([
    import("./container"),
    import("@/modules/identity/domain"),
  ]);
  try {
    await container().identity.accounts.changePassword(input.userId, input.current, input.next, input.sessionToken);
    return { ok: true };
  } catch (err) {
    if (IdentityError.is(err)) {
      return err.code === "password"
        ? { ok: false, error: input.errors.short, field: "next" }
        : { ok: false, error: input.errors.wrong, field: "current" };
    }
    throw err;
  }
}

export async function localDeleteAccount(input: {
  userId: string;
  password: string;
  locale: Locale;
  errors: { wrong: string };
}): Promise<{ ok: true } | { ok: false; error: string; field?: "current" }> {
  const [{ deleteClientAccount }, { IdentityError }] = await Promise.all([
    import("./account-deletion"),
    import("@/modules/identity/domain"),
  ]);
  try {
    await deleteClientAccount(input.userId, input.password, input.locale);
    return { ok: true };
  } catch (err) {
    if (IdentityError.is(err)) return { ok: false, error: input.errors.wrong, field: "current" };
    throw err;
  }
}

export async function localDeletionPreview(userId: string, locale: Locale): Promise<DeletionPreview> {
  const { deletionPreview } = await import("./account-deletion");
  return deletionPreview(userId, locale);
}

export async function localSetLocale(userId: string, locale: Locale): Promise<void> {
  const { container } = await import("./container");
  await container().identity.accounts.setLocale(userId, locale);
}

// ─── Полка, книги, приглашения, здоровье ─────────────────────────────────────────────────────────────────────────

/** Полка «Мои книги» напрямую из БД — единый сборщик для local()-фолбэка, apps/api webShelf и cabinetShelf. */
export async function localShelfBooks(userId: string, locale: Locale, m: Messages): Promise<ShelfBook[]> {
  const [{ container }, { isPrintedPlan, lastOrderPerBook, orderStatusLabel, orderStatusTone }] = await Promise.all([
    import("./container"),
    import("@/modules/ordering/ui/status"),
  ]);
  const c = container();
  const [rows, orders] = await Promise.all([c.authoring.queries.userBooks(userId), c.ordering.queries.userOrders(userId)]);
  const t = m.books.list;
  const now = new Date(nowMs());

  const sorted = [...rows].sort((a, b) => Number(a.book.status !== "draft") - Number(b.book.status !== "draft"));
  const lastOrder = lastOrderPerBook(orders);

  const nextSection = new Map<string, string>();
  await Promise.all(
    sorted
      .filter((r) => r.book.status === "draft" && r.answered > 0 && r.answered < r.total)
      .slice(0, NEXT_SECTION_LOOKUP)
      .map(async (r) => {
        const next = (await c.authoring.queries.questions(r.book.id)).find((q) => !q.answer.trim());
        if (next) nextSection.set(r.book.id, next.id);
      }),
  );

  return sorted.map((row): WebShelfBookDto => {
    const { book, answered, total, words, photos } = row;
    const blank = bookKind(book.theme) === "blank";
    const ordered = book.status !== "draft";
    const occasion = getOccasion(book.occasion);
    const dl = !ordered && occasion && book.occasionDate ? deadlineFor(book.occasionDate, now) : null;
    const last = lastOrder.get(book.id);
    const section = nextSection.get(book.id) ?? null;
    const printed = last ? isPrintedPlan(last.plan) : false;
    const coverDesign =
      book.coverDesign && typeof book.coverDesign === "object" && !Array.isArray(book.coverDesign)
        ? (book.coverDesign as Record<string, unknown>)
        : null;
    return {
      row: {
        book: {
          id: book.id,
          title: book.title,
          subtitle: book.subtitle,
          theme: book.theme,
          format: book.format,
          coverTemplate: book.coverTemplate,
          coverLines: book.coverLines ?? true,
          coverPhotoId: book.coverPhotoId ?? null,
          coverPhotoExtra: book.coverPhotoExtra ?? null,
          coverDesign,
          authorName: book.authorName,
          recipientName: book.recipientName,
          hideRecipientOnCover: book.hideRecipientOnCover,
          namesOnCover: book.namesOnCover,
        },
        answered,
        total,
        words,
        photos,
      },
      kind: getTheme(book.theme, locale).name,
      blank,
      progress: blank ? Math.min(100, Math.round((words / BLANK_READY_WORDS) * 100)) : total ? Math.round((answered / total) * 100) : 0,
      order: last
        ? {
            id: last.id,
            number: last.number,
            status: last.status,
            printed,
            statusLabel: orderStatusLabel(last.status, locale, printed),
            statusTone: orderStatusTone[last.status],
          }
        : null,
      ordered,
      writeHref: section ? `/books/${book.id}/questions?s=${section}` : `/books/${book.id}/questions`,
      writeSection: section,
      deadline:
        dl && occasion && dl.state !== "past"
          ? {
              text:
                m.common.deadline.chip(m.common.occasions[occasion.id].label, dl.daysToTarget) +
                (dl.state === "relaxed" || dl.state === "soon" || dl.state === "urgent" ? m.common.deadline.chipOrderBy(dl.orderBy) : ""),
              tone: dl.state === "relaxed" ? "calm" : dl.state === "soon" ? "warm" : "hot",
            }
          : null,
      updated: t.updated(formatDate(book.updatedAt, false, locale)),
    };
  });
}

export async function localBooksPageData(userId: string, locale: Locale, m: Messages): Promise<WebShelfDataDto> {
  const { container } = await import("./container");
  const c = container();
  const [books, agreement, rawRows] = await Promise.all([
    localShelfBooks(userId, locale, m),
    c.ordering.orders.agreementFor(userId),
    c.authoring.queries.userBooks(userId),
  ]);
  const agreementBooks = agreement
    ? rawRows.map((r) => ({
        id: r.book.id,
        status: r.book.status,
        theme: r.book.theme,
        answered: r.answered,
        total: r.total,
        words: r.words,
      }))
    : [];
  const normalizedAgreement: WebDealAgreementDto | null = agreement
    ? {
        dealId: agreement.dealId,
        dealNumber: agreement.dealNumber,
        agreedTotal: agreement.agreedTotal,
        prepaid: agreement.prepaid,
        plan: agreement.plan,
        ...(agreement.gifts !== undefined ? { gifts: agreement.gifts } : {}),
        deadline: agreement.deadline,
        ...(agreement.batch !== undefined ? { batch: agreement.batch } : {}),
        ...(agreement.recipient !== undefined ? { recipient: agreement.recipient } : {}),
      }
    : null;
  return { books: books as WebShelfBookDto[], agreement: normalizedAgreement, agreementBooks };
}

export async function localStartBook(userId: string, data: z.output<ReturnType<typeof createBookSchema>>): Promise<{ id: string }> {
  const { container } = await import("./container");
  const book = await container().authoring.books.start(userId, startBookInput(data));
  return { id: book.id };
}

export async function localInviteData(userId: string, locale: Locale): Promise<WebInviteDataDto> {
  const [{ container }, { inviteUrl, REFERRAL }] = await Promise.all([import("./container"), import("@/modules/referrals")]);
  const referrals = container().referrals.service;
  const code = await referrals.invite(userId);
  const summary = await referrals.summary(userId);
  return {
    code,
    link: inviteUrl(code, locale),
    friendPercent: REFERRAL.friendPercent,
    rewardPercent: REFERRAL.rewardPercent,
    friends: summary.friends,
    rewards: summary.rewards.map((r) => ({
      code: r.code,
      orderNumber: r.orderNumber,
      chat: r.chat,
      createdAt: r.createdAt.toISOString(),
      used: r.used,
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    })),
  };
}

export async function localHealth(): Promise<Omit<WebHealthDto, "time">> {
  const { container } = await import("./container");
  const c = container();
  const db = await c.databaseHealthy();
  const storage = await c.storageHealthy();
  const { redis, outbox } = db ? await c.infraHealth() : { redis: null, outbox: null };
  const ok = db && storage && redis !== false;
  return { ok, db, storage, redis, outbox };
}
