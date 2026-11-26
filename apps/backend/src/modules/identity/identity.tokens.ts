import type { Output } from "@mybook/contracts";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import type { startBookInput } from "@/lib/book/create-book-schema";
import type {
  CabinetBookHubSource,
  CabinetHelpThreadSource,
  CabinetPhotosSource,
  CabinetShelfSourceItem,
} from "@/lib/cabinet/views";
import type { BookRow, BookViewer } from "@/modules/authoring";
import type { CurrentUser, LinkPurpose, LoginResult, User } from "@/modules/identity";

/** Предпросмотр удаления аккаунта (данные из account-deletion без подписей экрана). */
export interface DeletionPreviewData {
  confirm: "password";
  items: string[];
  kept: string[];
  keptOrders: number[];
}

/** Итог обращения к помощнику по книге. */
export interface HelpAskResult {
  outcome: string;
  suggestions: string[];
  messages: CabinetHelpThreadSource["messages"];
}

/** Вход создания новой книги из мастера (общий для веба и API). */
export type StartBookInput = ReturnType<typeof startBookInput>;

/** Порт аутентификации Identity: вход, 2FA, выход, сессия встроенного браузера, регистрация и сброс пароля. */
export const IDENTITY_AUTH = Symbol("IdentityAuth");
export interface IdentityAuthPort {
  login(input: { login: string; password: string; locale: Locale }): Promise<LoginResult>;
  completeSecondFactor(userId: string, code: string, locale: Locale): Promise<{ token: string; expiresAt: Date; user: User }>;
  logout(token: string | undefined): Promise<void>;
  openCompanionSession(userId: string, ttlMs: number): Promise<{ token: string; expiresAt: Date }>;
  register(input: { name: string; email: string; password: string; locale: Locale; source: Record<string, string> | null }): Promise<{ token: string; expiresAt: Date; user: User }>;
  requestPasswordReset(email: string, locale: Locale): Promise<void>;
  linkInfo(token: string): Promise<{ purpose: LinkPurpose; valid: boolean } | null>;
  redeemAccessLink(token: string, password: string): Promise<{ token: string; expiresAt: Date; user: User }>;
  resetPassword(token: string, password: string): Promise<LoginResult>;
}

/** Порт профиля, пароля, напоминаний, языка и удаления клиентского аккаунта. */
export const IDENTITY_ACCOUNTS = Symbol("IdentityAccounts");
export interface IdentityAccountsPort {
  freshUserBySession(token: string): Promise<CurrentUser | null>;
  updateProfile(userId: string, name: string, phone: string | null): Promise<void>;
  changePassword(userId: string, current: string, next: string, currentToken: string | null): Promise<void>;
  setLocale(userId: string, locale: Locale): Promise<void>;
  setReminders(userId: string, on: boolean): Promise<void>;
  deletionPreview(userId: string, locale: Locale): Promise<DeletionPreviewData>;
  deleteClientAccount(userId: string, password: string, locale: Locale): Promise<DeletionPreviewData>;
}

/** Порт реестра мобильных устройств и конфигурации push (APNs/FCM) клиента и CRM. */
export const MOBILE_DEVICES = Symbol("MobileDevices");
export interface MobileDevicesPort {
  register(userId: string, input: { token: string; platform: "ios" | "android"; environment: "production" | "sandbox"; app: "crm" | "client" }): Promise<void>;
  forget(userId: string, token: string): Promise<void>;
  pushReady(platform: "ios" | "android"): boolean;
  androidClientOptions(): { apiKey: string; appId: string; projectId: string; senderId: string } | null;
}

/** Порты маршрутов веб-кабинета (регистрация, полка веба, создание/удаление книги, приглашения, здоровье). */
export const CABINET_WEB_PORTS = Symbol("CabinetWebPorts");
export interface CabinetWebPorts {
  syncRegistrationOpen(): Promise<boolean>;
  shopWhatsappDigits(): Promise<string>;
  webShelf(userId: string, locale: Locale, messages: Messages): Promise<Output<"webShelf">>;
  startBook(userId: string, input: StartBookInput): Promise<{ id: string }>;
  deleteBook(bookId: string, viewer: BookViewer): Promise<void>;
  inviteData(userId: string, locale: Locale): Promise<Output<"webInvite">>;
  healthStatus(): Promise<Omit<Output<"webHealth">, "time">>;
}

/** Порты кабинета приложения и доступа к книгам (чтение книги, полка, штаб, вкладка фото, помощник). */
export const CABINET_BOOK_PORTS = Symbol("CabinetBookPorts");
export interface CabinetBookPorts {
  bookOwnership(bookId: string): Promise<{ managerId: string | null } | null>;
  visibleBook(bookId: string, viewer: BookViewer): Promise<BookRow | null>;
  shelfBooks(userId: string, locale: Locale, messages: Messages): Promise<CabinetShelfSourceItem[]>;
  bookHub(book: BookRow, locale: Locale, messages: Messages): Promise<CabinetBookHubSource>;
  photosTab(book: BookRow, editable: boolean, messages: Messages): Promise<CabinetPhotosSource>;
  helpThread(book: BookRow, userId: string): Promise<CabinetHelpThreadSource>;
  helpAsk(
    book: BookRow,
    user: { id: string; name: string | null },
    input: { text: string; place: null; human: boolean },
    locale: Locale,
  ): Promise<HelpAskResult>;
}
