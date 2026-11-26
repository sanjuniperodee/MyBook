import type { z } from "zod";
import type { AccountView } from "@mybook/contracts";
import { ACCOUNT_LIMITS } from "@mybook/contracts/limits";
import { localeMeta, locales, type Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { accountDeletionFor } from "@/i18n/messages/account-deletion";
import { MIN_PASSWORD_LENGTH } from "../domain/User";

/**
 * Экран «Аккаунт» и подписи удаления аккаунта — чистые проекции без Next и БД, общие для mybook-api и NestJS (ADR 0014).
 */

export type AccountDto = z.infer<typeof AccountView>;
export type AccountNotice = AccountDto["notice"];

export interface AccountProfileSource {
  name: string;
  phone: string | null;
  email: string;
  emailOptOut: boolean;
}

/** Аккаунт как страница /account сайта: те же тексты (orders.account), язык — выбранный пользователем. */
export function buildAccountView(u: AccountProfileSource, locale: Locale, notice: AccountNotice = null): AccountDto {
  const m = messagesFor(locale);
  const t = m.orders.account;
  return {
    profile: { name: u.name, phone: u.phone ?? "", email: u.email },
    remindersOn: !u.emailOptOut,
    locale,
    locales: locales.map((id) => ({ id, label: localeMeta[id].label })),
    limits: { name: ACCOUNT_LIMITS.name, passwordMin: MIN_PASSWORD_LENGTH },
    notice,
    labels: {
      title: t.title,
      lead: t.lead,
      groups: t.groups,
      email: t.email,
      emailHint: t.emailHint,
      name: t.name,
      phone: t.phone,
      save: t.save,
      current: t.current,
      next: t.next,
      change: t.change,
      languageText: t.languageText,
      logout: m.common.nav.logout,
      notifications: {
        orderMail: t.notifications.orderMail,
        orderMailValue: t.notifications.orderMailValue,
        reminders: t.notifications.reminders,
        on: t.notifications.on,
        off: t.notifications.off,
        onHint: t.notifications.onHint,
        offHint: t.notifications.offHint,
        turnOn: t.notifications.turnOn,
        turnOff: t.notifications.turnOff,
      },
    },
  };
}

/** Надписи экрана удаления для приложения — тексты кабинета сайта (один источник), без списков. */
export function deletionLabels(locale: Locale) {
  const t = accountDeletionFor(locale);
  return {
    title: t.title,
    intro: t.intro,
    accounting: t.accounting,
    password: t.password,
    forgot: t.forgot,
    next: t.next,
    confirmTitle: t.confirmTitle,
    confirm: t.confirm,
    cancel: t.cancel,
    done: t.done,
  };
}
