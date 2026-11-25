/** Телефон для push клиента и настройки приложения — API v1. Устройства — тот же реестр, что у приложения продажника. */
import { env } from "@/config/env";
import { isLocale, localizePath, type Locale } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { IdentityError } from "@/modules/identity";
import { mobileDevices } from "@/modules/workspace";
import { deleteClientAccount, deletionPreview } from "@/server/account-deletion";
import { HttpError } from "@/server/api";
import type { Handlers } from "../app";

/** Язык ответа: из запроса, иначе язык пользователя (cookie или профиль). */
async function localeOf(raw: string | undefined): Promise<Locale> {
  const l = raw ?? (await getLocale());
  return isLocale(l) ? l : "ru";
}

export const meHandlers: Pick<Handlers, "meDevicePut" | "meDeviceDelete" | "appConfig" | "meDeletionInfo" | "meDelete"> = {
  async meDevicePut({ user, input }) {
    await mobileDevices.register(user!.id, { ...input.body, app: "client" });
    return { ok: true, serverReady: mobileDevices.pushReady(input.body.platform) };
  },

  async meDeviceDelete({ user, input }) {
    await mobileDevices.forget(user!.id, input.body.token);
    return { ok: true };
  },

  async appConfig({ input }) {
    const locale = await localeOf(input.locale);
    return { privacyUrl: `${env.appUrl}${localizePath("/privacy", locale)}`, termsUrl: `${env.appUrl}${localizePath("/offer", locale)}` };
  },

  async meDeletionInfo({ user, input }) {
    return deletionPreview(user!.id, await localeOf(input.locale));
  },

  /** Сотрудник себя не удаляет (его отключает руководитель); неверный пароль — 400, чтобы приложение не сочло это выходом. */
  async meDelete({ user, input }) {
    if (user!.role !== "user") throw new HttpError(403, "staffAccount");
    try {
      return { ok: true as const, ...(await deleteClientAccount(user!.id, input.body.password, await localeOf(input.locale))) };
    } catch (err) {
      if (IdentityError.is(err)) throw new HttpError(400, "wrongPassword");
      throw err;
    }
  },
};
