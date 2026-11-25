/** Телефон для push клиента и настройки приложения — API v1. Устройства — тот же реестр, что у приложения продажника. */
import { env } from "@/config/env";
import { isLocale, localizePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { mobileDevices } from "@/modules/workspace";
import type { Handlers } from "../app";

export const meHandlers: Pick<Handlers, "meDevicePut" | "meDeviceDelete" | "appConfig"> = {
  async meDevicePut({ user, input }) {
    await mobileDevices.register(user!.id, { ...input.body, app: "client" });
    return { ok: true, serverReady: mobileDevices.pushReady(input.body.platform) };
  },

  async meDeviceDelete({ user, input }) {
    await mobileDevices.forget(user!.id, input.body.token);
    return { ok: true };
  },

  async appConfig({ input }) {
    const raw = input.locale ?? (await getLocale());
    const locale = isLocale(raw) ? raw : "ru";
    return { privacyUrl: `${env.appUrl}${localizePath("/privacy", locale)}`, termsUrl: `${env.appUrl}${localizePath("/offer", locale)}` };
  },
};
