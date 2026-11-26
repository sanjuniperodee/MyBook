/** Телефон для push клиента и настройки приложения — API v1. Устройства — тот же реестр, что у приложения продажника. */
import { env } from "@/config/env";
import { isLocale, localizePath, type Locale } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { messagesFor } from "@/i18n/messages";
import { IdentityError } from "@/modules/identity";
import { buildAccountView, deletionLabels, type AccountDto, type AccountNotice } from "@/modules/identity/ui/accountView";
import {
  fcmClientOptions,
  fcmConfig,
  mobileDevices,
} from "@/modules/workspace";
import {
  deleteClientAccount,
  deletionPreview,
} from "@/server/account-deletion";
import { HttpError } from "@/server/api";
import { sessionToken } from "@/server/auth";
import { container } from "@/server/container";
import { rateLimit, trustedClientIp } from "@/server/rateLimit";
import { ACCOUNT_LIMITS } from "@mybook/contracts/limits";
import type { Handlers } from "../app";

/** Свежий пользователь сессии (после правки: getCurrentUser держит прежнего на весь запрос). */
async function freshUser() {
  const identity = container().identity;
  const token = await sessionToken();
  const user = token
    ? await identity.queries.userBySession(
        identity.tokens.hash(token),
        new Date(),
      )
    : null;
  if (!user) throw new HttpError(401, "unauthorized");
  return user;
}

/** Аккаунт как страница /account сайта: те же тексты (orders.account), язык — выбранный пользователем. */
async function accountView(
  notice: AccountNotice = null,
  raw?: string,
): Promise<AccountDto> {
  const u = await freshUser();
  const locale = isLocale(raw)
    ? raw
    : isLocale(u.locale)
      ? u.locale
      : await localeOf(undefined);
  return buildAccountView(u, locale, notice);
}

/** Тексты формы аккаунта на языке пользователя. */
async function accountTexts() {
  const u = await freshUser();
  return {
    user: u,
    t: messagesFor(isLocale(u.locale) ? u.locale : await localeOf(undefined))
      .orders.account,
  };
}

/** Язык ответа: из запроса, иначе язык пользователя (cookie или профиль). */
async function localeOf(raw: string | undefined): Promise<Locale> {
  const l = raw ?? (await getLocale());
  return isLocale(l) ? l : "ru";
}

export const meHandlers: Pick<
  Handlers,
  | "meDevicePut"
  | "meDeviceDelete"
  | "crmPushConfig"
  | "crmDevicePut"
  | "crmDeviceDelete"
  | "appConfig"
  | "meDeletionInfo"
  | "meDelete"
  | "meAccount"
  | "meProfileUpdate"
  | "mePasswordChange"
  | "meRemindersSet"
  | "meLocaleSet"
> = {
  async meAccount({ input }) {
    return accountView(null, input.locale);
  },

  /** Как updateProfileAction сайта: имя обязательно, телефон — пустой или похожий на номер. */
  async meProfileUpdate({ input }) {
    const { user, t } = await accountTexts();
    const name = input.body.name.trim();
    const phone = input.body.phone.trim();
    if (!name || name.length > ACCOUNT_LIMITS.name)
      return accountView({ ok: false, text: t.errors.name, field: "name" });
    if (phone && !ACCOUNT_LIMITS.phone.test(phone))
      return accountView({ ok: false, text: t.errors.phone, field: "phone" });
    await container().identity.accounts.updateProfile(
      user.id,
      name,
      phone || null,
    );
    return accountView({ ok: true, text: t.saved, field: null });
  },

  /** Как changePasswordAction сайта: 10 попыток за 15 минут, остальные устройства выходят, этот телефон — нет. */
  async mePasswordChange({ input }) {
    const { user, t } = await accountTexts();
    if (
      !(await rateLimit(
        `pwd:${user.id}:${await trustedClientIp()}`,
        10,
        900_000,
      ))
    )
      return accountView({ ok: false, text: t.errors.tooMany, field: null });
    try {
      await container().identity.accounts.changePassword(
        user.id,
        input.body.current,
        input.body.next,
        await sessionToken(),
      );
    } catch (err) {
      if (IdentityError.is(err))
        return accountView(
          err.code === "password"
            ? { ok: false, text: t.errors.short, field: "next" }
            : { ok: false, text: t.errors.wrong, field: "current" },
        );
      throw err;
    }
    return accountView({ ok: true, text: t.changed, field: null });
  },

  async meRemindersSet({ input }) {
    const { user, t } = await accountTexts();
    await container().notifications.subscriptions.setReminders(
      user.id,
      input.body.on,
    );
    return accountView({
      ok: true,
      text: input.body.on ? t.notifications.savedOn : t.notifications.savedOff,
      field: null,
    });
  },

  /** Как переключатель языка сайта (/api/locale): язык профиля — письма и тексты с сервера. */
  async meLocaleSet({ input }) {
    const { user } = await accountTexts();
    if (user.locale !== input.body.locale)
      await container().identity.accounts.setLocale(user.id, input.body.locale);
    return accountView(null, input.body.locale);
  },

  async meDevicePut({ user, input }) {
    await mobileDevices.register(user!.id, { ...input.body, app: "client" });
    return {
      ok: true,
      serverReady: mobileDevices.pushReady(input.body.platform),
    };
  },

  async meDeviceDelete({ user, input }) {
    await mobileDevices.forget(user!.id, input.body.token);
    return { ok: true };
  },

  async crmPushConfig() {
    return {
      ios: mobileDevices.pushReady("ios"),
      android: fcmClientOptions(fcmConfig()),
    };
  },

  async crmDevicePut({ user, input }) {
    await mobileDevices.register(user!.id, { ...input.body, app: "crm" });
    return {
      ok: true,
      serverReady: mobileDevices.pushReady(input.body.platform),
    };
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
    return {
      ...(await deletionPreview(user!.id, locale)),
      labels: deletionLabels(locale),
    };
  },

  /** Сотрудник себя не удаляет (его отключает руководитель); неверный пароль — 400, чтобы приложение не сочло это выходом. */
  async meDelete({ user, input }) {
    if (user!.role !== "user") throw new HttpError(403, "staffAccount");
    const locale = await localeOf(input.locale);
    if (!(await rateLimit(`del:${user!.id}:${await trustedClientIp()}`, 10, 900_000))) {
      return Response.json({ error: messagesFor(locale).orders.account.errors.tooMany, code: "tooMany" }, { status: 429 });
    }
    try {
      return {
        ok: true as const,
        ...(await deleteClientAccount(user!.id, input.body.password, locale)),
        labels: deletionLabels(locale),
      };
    } catch (err) {
      if (IdentityError.is(err)) throw new HttpError(400, "wrongPassword");
      throw err;
    }
  },
};
