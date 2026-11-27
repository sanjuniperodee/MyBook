import type { Locale } from "@/i18n/config";
import type { StaffMember } from "../../core/auth/staff";

/** Порты Контекста 6 («CRM-mobile: раздача APK/iOS, счета и аудио чатов на @SiteRoute»). */
export const CRM_MOBILE_SITE_PORTS = Symbol("CrmMobileSitePorts");

/** Явный контекст запроса сотрудника для вызовов переходного слоя legacy без `next/headers`. */
export interface CrmSiteCallContext {
  staff: StaffMember;
  token: string | null;
  ip: string;
  locale: Locale;
}

export interface IosBuildMeta {
  version: string;
  build: string;
  bundleId: string;
  udids: string[];
  builtAt: string;
}

export interface IosDeviceAttributes {
  udid: string;
  product: string;
  version: string;
}

export interface IosStatusView {
  build: { version: string; build: string; builtAt: string } | null;
  devices: Array<{ id: string; product: string; iosVersion: string; createdAt: string; ready: boolean }>;
}

export interface AudioRangeRequest {
  range: string | null;
  ifNoneMatch: string | null;
}

export type InvoiceActionResult =
  | { ok: true; message: string; link: string; text: string; sent: boolean }
  | { ok: false; message: string };

export interface InvoiceCancelResult {
  ok: boolean;
  message: string;
}

export type InvoiceFormInfoResult = { ok: true; info: unknown } | { ok: false; message: string };

export interface CrmMobileSitePorts {
  // Раздача Android APK и iPhone Ad Hoc (6 маршрутов)
  hasMobileApk(): Promise<boolean>;
  readMobileApk(): Promise<Buffer>;
  saveMobileApk(ctx: CrmSiteCallContext, data: Uint8Array, fileName: string): Promise<void>;
  iosEnrollProfile(userId: string): string;
  iosStatus(userId: string): Promise<IosStatusView>;
  readIosToken(token: string | null, action: "enroll" | "install"): string | null;
  iosBuild(): Promise<IosBuildMeta | null>;
  readIosIpa(): Promise<Buffer>;
  installManifest(ipaUrl: string, build: IosBuildMeta): string;
  parseIosDevice(body: Buffer): IosDeviceAttributes | null;
  saveIosDevice(userId: string, device: IosDeviceAttributes): Promise<void>;
  scheduleIosResign(): void;

  // Счета из чата и сделки (3 маршрута)
  invoiceFormInfo(ctx: CrmSiteCallContext, input: { dealId?: string; conversationId?: string }): Promise<InvoiceFormInfoResult>;
  issueInvoice(ctx: CrmSiteCallContext, raw: unknown): Promise<InvoiceActionResult>;
  cancelInvoice(ctx: CrmSiteCallContext, id: string): Promise<InvoiceCancelResult>;
  resendInvoice(ctx: CrmSiteCallContext, id: string): Promise<InvoiceActionResult>;

  // Потоковое аудио сообщения чата (Range / ETag)
  findMediaAttachment(messageId: string): Promise<{ conversation: { assigneeId: string | null; dealId: string | null } } | null>;
  findDealAssignee(dealId: string): Promise<{ assigneeId: string | null } | null>;
  chatAudioFile(messageId: string): Promise<{ path: string; mime: string } | null>;
  serveAudioFile(filePath: string, mime: string, req: AudioRangeRequest, headers: Record<string, string>): Promise<Response>;
}
