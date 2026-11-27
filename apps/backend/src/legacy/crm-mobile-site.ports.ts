import type { Provider } from "@nestjs/common";
import { env } from "@/config/env";
import { audit } from "@/server/access";
import { chatAudioFile } from "@/server/chat-audio";
import type { Container } from "@/server/container";
import { cancelInvoiceAction, invoiceFormInfoAction, issueInvoiceAction, resendInvoiceAction } from "@/server/crm-actions/invoices";
import {
  enrollProfile,
  installManifest,
  iosBuild,
  iosStatus,
  iosToken,
  parseDeviceAttributes,
  readIosIpa,
  readIosToken,
  saveIosDevice,
} from "@/server/ios-app";
import { resignAfterEnroll } from "@/server/ios-sign";
import { hasMobileApk, readMobileApk, saveMobileApk } from "@/server/mobile-apk";
import { serveFile } from "@/server/range-file";
import {
  CRM_MOBILE_SITE_PORTS,
  type AudioRangeRequest,
  type CrmMobileSitePorts,
  type CrmSiteCallContext,
} from "../modules/crm-mobile-site/crm-mobile-site.tokens";
import { runInLegacyRequest, toLegacyStaff } from "./legacy-request";
import { LEGACY_CONTAINER } from "./legacy.tokens";

const inRequest = <T>(ctx: CrmSiteCallContext, fn: () => T): T =>
  runInLegacyRequest({ staff: ctx.staff, token: ctx.token, ip: ctx.ip, locale: ctx.locale }, fn);

/** Синтетический Request для `serveFile` (Range / If-None-Match) без `next/headers`. */
function audioRequestOf(req: AudioRangeRequest): Request {
  const headers = new Headers();
  if (req.range) headers.set("range", req.range);
  if (req.ifNoneMatch) headers.set("if-none-match", req.ifNoneMatch);
  return new Request("http://localhost/", { headers });
}

type IssueInvoiceInput = Parameters<typeof issueInvoiceAction>[0];

/**
 * Адаптер переходного периода для Контекста 6 (`CrmMobileSiteModule`):
 * связывает раздачу APK/iOS, счета CRM и потоковое аудио со старым контейнером и `crm-actions/*`
 * строго внутри `runInLegacyRequest` (ноль обращений к `next/headers` и `next/server` `after()`).
 */
export const legacyCrmMobileSitePorts: Provider<CrmMobileSitePorts> = {
  provide: CRM_MOBILE_SITE_PORTS,
  useFactory: (c: Container): CrmMobileSitePorts => ({
    hasMobileApk: () => hasMobileApk(),
    readMobileApk: () => readMobileApk(),
    saveMobileApk: (ctx, data, fileName) =>
      inRequest(ctx, async () => {
        await saveMobileApk(data);
        await audit(toLegacyStaff(ctx.staff), "settings.update", "settings", "mobile.apk", { name: fileName, size: data.length });
      }),
    iosEnrollProfile: (userId) => enrollProfile(env.appUrl.replace(/\/+$/, ""), iosToken(userId, "enroll", 24 * 3600)),
    iosStatus: (userId) => iosStatus(userId),
    readIosToken: (token, action) => readIosToken(token, action),
    iosBuild: () => iosBuild(),
    readIosIpa: () => readIosIpa(),
    installManifest: (ipaUrl, build) => installManifest(ipaUrl, build),
    parseIosDevice: (body) => parseDeviceAttributes(body),
    saveIosDevice: async (userId, device) => {
      await saveIosDevice(userId, device);
    },
    scheduleIosResign: () => {
      void Promise.resolve().then(() => resignAfterEnroll());
    },

    invoiceFormInfo: (ctx, input) => inRequest(ctx, () => invoiceFormInfoAction(input)),
    issueInvoice: (ctx, raw) => inRequest(ctx, () => issueInvoiceAction(raw as IssueInvoiceInput)),
    cancelInvoice: (ctx, id) => inRequest(ctx, () => cancelInvoiceAction(id)),
    resendInvoice: (ctx, id) => inRequest(ctx, () => resendInvoiceAction(id)),

    findMediaAttachment: async (messageId) => (await c.messaging.media.find(messageId)) ?? null,
    findDealAssignee: async (dealId) => {
      const deal = await c.sales.deals.findById(dealId);
      return deal ? { assigneeId: deal.assigneeId } : null;
    },
    chatAudioFile: (messageId) => chatAudioFile(messageId),
    serveAudioFile: (filePath, mime, req, headers) => serveFile(filePath, mime, audioRequestOf(req), headers),
  }),
  inject: [LEGACY_CONTAINER],
};
