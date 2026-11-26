import type { Provider } from "@nestjs/common";
import { registrationOpen, site } from "@/config/site";
import { fcmClientOptions, fcmConfig, mobileDevices } from "@/modules/workspace";
import { deleteClientAccount, deletionPreview } from "@/server/account-deletion";
import { helpAsk, helpThread } from "@/server/book-help";
import { syncCatalogFromSettings } from "@/server/catalog";
import type { Container } from "@/server/container";
import { photosTabData } from "@/server/photos-tab-data";
import { localBooksPageData, localHealth, localInviteData, localShelfBooks } from "@/server/v1-local-bridge";
import { localBookHubDto } from "@/server/v1-local-bridge-book";
import {
  CABINET_BOOK_PORTS,
  CABINET_WEB_PORTS,
  IDENTITY_ACCOUNTS,
  IDENTITY_AUTH,
  MOBILE_DEVICES,
  type CabinetBookPorts,
  type CabinetWebPorts,
  type IdentityAccountsPort,
  type IdentityAuthPort,
  type MobileDevicesPort,
} from "../modules/identity/identity.tokens";
import { LEGACY_CONTAINER } from "./legacy.tokens";

/**
 * Порты Контекста 1 («Identity и кабинет») к старому контейнеру и общим серверным оркестраторам.
 * Ни одна функция здесь не вызывает `next/headers` (кэш каталога, штаб книги и вкладка фото читают БД напрямую,
 * а не через `v1WebRead`/`ensureCatalogViaApi`).
 */
export const legacyIdentityAuthPort: Provider<IdentityAuthPort> = {
  provide: IDENTITY_AUTH,
  useFactory: (c: Container): IdentityAuthPort => ({
    login: (input) => c.identity.auth.login(input),
    completeSecondFactor: (userId, code, locale) => c.identity.auth.completeSecondFactor(userId, code, locale),
    logout: (token) => c.identity.auth.logout(token),
    openCompanionSession: (userId, ttlMs) => c.identity.auth.openCompanionSession(userId, ttlMs),
    register: (input) => c.identity.auth.register(input),
    requestPasswordReset: (email, locale) => c.identity.auth.requestPasswordReset(email, locale),
    linkInfo: (token) => c.identity.auth.linkInfo(token),
    redeemAccessLink: (token, password) => c.identity.auth.redeemAccessLink(token, password),
    resetPassword: (token, password) => c.identity.auth.resetPassword(token, password),
  }),
  inject: [LEGACY_CONTAINER],
};

export const legacyIdentityAccountsPort: Provider<IdentityAccountsPort> = {
  provide: IDENTITY_ACCOUNTS,
  useFactory: (c: Container): IdentityAccountsPort => ({
    freshUserBySession: (token) => c.identity.queries.userBySession(c.identity.tokens.hash(token), c.clock.now()),
    updateProfile: (userId, name, phone) => c.identity.accounts.updateProfile(userId, name, phone),
    changePassword: (userId, current, next, currentToken) => c.identity.accounts.changePassword(userId, current, next, currentToken),
    setLocale: (userId, locale) => c.identity.accounts.setLocale(userId, locale),
    setReminders: (userId, on) => c.notifications.subscriptions.setReminders(userId, on),
    deletionPreview: (userId, locale) => deletionPreview(userId, locale),
    deleteClientAccount: (userId, password, locale) => deleteClientAccount(userId, password, locale),
  }),
  inject: [LEGACY_CONTAINER],
};

export const legacyMobileDevicesPort: Provider<MobileDevicesPort> = {
  provide: MOBILE_DEVICES,
  useFactory: (): MobileDevicesPort => ({
    register: (userId, input) => mobileDevices.register(userId, input),
    forget: (userId, token) => mobileDevices.forget(userId, token),
    pushReady: (platform) => mobileDevices.pushReady(platform),
    androidClientOptions: () => fcmClientOptions(fcmConfig()),
  }),
};

export const legacyCabinetWebPorts: Provider<CabinetWebPorts> = {
  provide: CABINET_WEB_PORTS,
  useFactory: (c: Container): CabinetWebPorts => ({
    syncRegistrationOpen: async () => {
      await syncCatalogFromSettings();
      return registrationOpen();
    },
    shopWhatsappDigits: () => c.marketing.service.shopWhatsapp().catch(() => site.contacts.whatsapp.replace(/\D/g, "")),
    webShelf: (userId, locale, messages) => localBooksPageData(userId, locale, messages),
    startBook: async (userId, input) => {
      const book = await c.authoring.books.start(userId, input);
      return { id: book.id };
    },
    deleteBook: (bookId, viewer) => c.authoring.books.delete(bookId, viewer),
    inviteData: (userId, locale) => localInviteData(userId, locale),
    healthStatus: () => localHealth(),
  }),
  inject: [LEGACY_CONTAINER],
};

export const legacyCabinetBookPorts: Provider<CabinetBookPorts> = {
  provide: CABINET_BOOK_PORTS,
  useFactory: (c: Container): CabinetBookPorts => ({
    bookOwnership: (bookId) => c.reporting.bookOwnership(bookId),
    visibleBook: (bookId, viewer) => c.authoring.queries.visibleBook(bookId, viewer),
    shelfBooks: (userId, locale, messages) => localShelfBooks(userId, locale, messages),
    bookHub: (book, locale, messages) => localBookHubDto(book, locale, messages),
    photosTab: (book, editable, messages) => photosTabData(book, editable, messages),
    helpThread: (book, userId) => helpThread(book, userId),
    helpAsk: (book, user, input, locale) => helpAsk(book, user, input, locale),
  }),
  inject: [LEGACY_CONTAINER],
};

export const legacyIdentityPorts: Provider[] = [
  legacyIdentityAuthPort,
  legacyIdentityAccountsPort,
  legacyMobileDevicesPort,
  legacyCabinetWebPorts,
  legacyCabinetBookPorts,
];

export const LEGACY_IDENTITY_TOKENS = [
  IDENTITY_AUTH,
  IDENTITY_ACCOUNTS,
  MOBILE_DEVICES,
  CABINET_WEB_PORTS,
  CABINET_BOOK_PORTS,
] as const;
