/** Телефон для push клиента и настройки приложения — API v1. Устройства — тот же реестр, что у приложения продажника. */
import { env } from "@/config/env";
import { isLocale, localizePath, type Locale } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { accountDeletionFor } from "@/i18n/messages/account-deletion";
import { messagesFor } from "@/i18n/messages";
import { IdentityError } from "@/modules/identity";
import { fcmClientOptions, fcmConfig, mobileDevices } from "@/modules/workspace";
import { deleteClientAccount, deletionPreview } from "@/server/account-deletion";
import { HttpError } from "@/server/api";
import type { Handlers } from "../app";

/** Язык ответа: из запроса, иначе язык пользователя (cookie или профиль). */
async function localeOf(raw: string | undefined): Promise<Locale> {
  const l = raw ?? (await getLocale());
  return isLocale(l) ? l : "ru";
}

/** Надписи экрана удаления для приложения — тексты кабинета сайта (один источник), без списков. */
function deletionLabels(locale: Locale) {
  const t = accountDeletionFor(locale);
  return { title: t.title, intro: t.intro, accounting: t.accounting, password: t.password, forgot: t.forgot, next: t.next, confirmTitle: t.confirmTitle, confirm: t.confirm, cancel: t.cancel, done: t.done };
}

export const meHandlers: Pick<Handlers, "meDevicePut" | "meDeviceDelete" | "crmPushConfig" | "crmDevicePut" | "crmDeviceDelete" | "appConfig" | "meDeletionInfo" | "meDelete"> = {
  async meDevicePut({ user, input }) {
    await mobileDevices.register(user!.id, { ...input.body, app: "client" });
    return { ok: true, serverReady: mobileDevices.pushReady(input.body.platform) };
  },

  async meDeviceDelete({ user, input }) {
    await mobileDevices.forget(user!.id, input.body.token);
    return { ok: true };
  },

  async crmPushConfig() {
    return { ios: mobileDevices.pushReady("ios"), android: fcmClientOptions(fcmConfig()) };
  },

  async crmDevicePut({ user, input }) {
    await mobileDevices.register(user!.id, { ...input.body, app: "crm" });
    return { ok: true, serverReady: mobileDevices.pushReady(input.body.platform) };
  },

  async crmDeviceDelete({ user, input }) {
    await mobileDevices.forget(user!.id, input.body.token);
    return { ok: true };
  },

  async appConfig({ input }) {
    const locale = await localeOf(input.locale);
    const legal = messagesFor(locale).legal;
    return {
      privacyUrl: `${env.appUrl}${localizePath("/privacy", locale)}`,
      termsUrl: `${env.appUrl}${localizePath("/offer", locale)}`,
      labels: { privacy: legal.privacy.title, terms: legal.offer.title },
    };
  },

  async meDeletionInfo({ user, input }) {
    const locale = await localeOf(input.locale);
    return { ...(await deletionPreview(user!.id, locale)), labels: deletionLabels(locale) };
  },

  /** Сотрудник себя не удаляет (его отключает руководитель); неверный пароль — 400, чтобы приложение не сочло это выходом. */
  async meDelete({ user, input }) {
    if (user!.role !== "user") throw new HttpError(403, "staffAccount");
    try {
      const locale = await localeOf(input.locale);
      return { ok: true as const, ...(await deleteClientAccount(user!.id, input.body.password, locale)), labels: deletionLabels(locale) };
    } catch (err) {
      if (IdentityError.is(err)) throw new HttpError(400, "wrongPassword");
      throw err;
    }
  },
};
