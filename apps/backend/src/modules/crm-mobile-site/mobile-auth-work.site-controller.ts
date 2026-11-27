import { Controller, Inject, Logger, Param, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { admin } from "@/i18n/admin";
import type { Locale } from "@/i18n/config";
import { staffErrorMessageFor } from "@/i18n/domain-errors";
import { planName } from "@/i18n/labels";
import { IdentityError } from "@/modules/identity";
import type { RateLimiter } from "@/shared/application/RateLimiter";
import { mobileLayout } from "@/shared/domain/mobileLayout";
import { ORDER_STATUSES } from "@/shared/domain/orders";
import { staffLabel } from "@/shared/domain/staff";
import { issueTicket, readTicket } from "@/shared/two-factor-ticket";
import type { StaffMember } from "../../core/auth/staff";
import { CurrentStaff, Permissions } from "../../core/auth/staff.decorators";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { ApiError } from "../../core/errors/api-error";
import { clientIp } from "../../core/http/client-ip";
import { RequestLocale, SessionToken } from "../../core/http/decorators";
import { RawBody, SiteRoute } from "../../core/http/site-route";
import { RATE_LIMITER } from "../../core/kernel/tokens";
import { CRM_LISTS_PORTS, type CrmListsPorts } from "../crm-core/crm-core.tokens";
import { CRM_MOBILE_API_PORTS, type CrmChatProductsResult, type CrmMobileApiPorts } from "../crm-mobile-api/crm-mobile-api.tokens";
import { IDENTITY_AUTH, MOBILE_DEVICES, type IdentityAuthPort, type MobileDevicesPort } from "../identity/identity.tokens";
import {
  parseJsonBody,
  parseOptionalJsonBody,
  requireUuid,
  runMobile,
  searchParamsOf,
  siteCallContext,
} from "./crm-mobile-site.helpers";
import { CRM_MOBILE_SITE_PORTS, type CrmMobileSitePorts } from "./crm-mobile-site.tokens";

const WEB_SESSION_TTL_MS = 12 * 60 * 60_000;
const OVERVIEW_PERIODS = new Set([7, 30, 90]);

const loginBodySchema = z.object({
  login: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(200),
});

const secondFactorBodySchema = z.object({
  ticket: z.string().min(10).max(300),
  code: z.string().trim().min(4).max(40),
});

const shiftBodySchema = z.object({ onShift: z.boolean() });
const notifyReadBodySchema = z.object({ id: z.string().uuid().optional() });

const iosPushToken = z.string().regex(/^[0-9a-fA-F]{32,200}$/);
const fcmPushToken = z.string().regex(/^[A-Za-z0-9:_-]{32,4096}$/);
const pushDeviceSchema = z.discriminatedUnion("platform", [
  z.object({ platform: z.literal("ios"), token: iosPushToken, environment: z.enum(["production", "sandbox"]).default("production") }),
  z.object({ platform: z.literal("android"), token: fcmPushToken, environment: z.enum(["production", "sandbox"]).default("production") }),
]);
const pushForgetSchema = z.object({ token: z.union([iosPushToken, fcmPushToken]) });

const templatesReorderSchema = z.object({ ids: z.array(z.string()).max(100) });
const templateDraftSchema = z.object({ chatId: z.string(), messageId: z.string() });
const templateSaveSchema = z.object({ id: z.string().optional(), title: z.string().max(200), text: z.string().max(5000) });

const callDialSchema = z.object({
  dealId: z.string().uuid().nullish(),
  orderId: z.string().uuid().nullish(),
  clientId: z.string().uuid().nullish(),
  callId: z.string().uuid().nullish(),
});

const invoiceActionSchema = z.object({ action: z.enum(["cancel", "resend"]) });
const orderStatusSchema = z.object({ status: z.enum(ORDER_STATUSES) });

/**
 * Старое мобильное приложение CRM — вход, профиль, «Мой день», «Обзор», сотрудники, уведомления, push,
 * встроенный браузер, личные шаблоны, каталог, звонки, счета и заказы (26 путей, 30 HTTP-обработчиков).
 * Статические подмаршруты (`/me/shift`, `/templates/reorder`, `/templates/draft`, `/calls/dial`, `/invoices/info`)
 * объявлены раньше параметрических `{id}`.
 */
@Controller()
export class MobileAuthWorkSiteController {
  private readonly log = new Logger("mobile-auth-work-site");

  constructor(
    @Inject(IDENTITY_AUTH) private readonly identityAuth: IdentityAuthPort,
    @Inject(MOBILE_DEVICES) private readonly mobileDevices: MobileDevicesPort,
    @Inject(CRM_LISTS_PORTS) private readonly crmLists: CrmListsPorts,
    @Inject(CRM_MOBILE_API_PORTS) private readonly crmMobileApi: CrmMobileApiPorts,
    @Inject(CRM_MOBILE_SITE_PORTS) private readonly ports: CrmMobileSitePorts,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private async checkLoginLimit(req: FastifyRequest, key: string): Promise<Response | null> {
    const ip = clientIp(req, this.config.edgeIpSecret);
    const byIp = await this.limiter.hit(`m-login:${ip}`, 30, 900_000);
    if (!byIp) return Response.json({ error: admin.mobileTooManyLogins }, { status: 429 });
    const byKey = await this.limiter.hit(`m-login:${key.toLowerCase()}`, 10, 900_000);
    if (!byKey) return Response.json({ error: admin.mobileTooManyLogins }, { status: 429 });
    return null;
  }

  private async finishStaffSession(result: {
    token: string;
    expiresAt: Date;
    user: { id: string; name: string; email: string; isStaff: boolean };
  }): Promise<Response> {
    const u = result.user;
    if (!u.isStaff) {
      await this.identityAuth.logout(result.token);
      throw new ApiError(403, "forbidden");
    }
    return Response.json({
      token: result.token,
      expiresAt: result.expiresAt.toISOString(),
      user: { id: u.id, name: u.name, email: u.email },
    });
  }

  private mapAuthFailure(err: unknown): Response {
    const text = IdentityError.is(err) ? staffErrorMessageFor(err, IdentityError) : null;
    if (!text) throw err;
    return Response.json({ error: text }, { status: 401 });
  }

  // ─── Аутентификация (3 пути) ─────────────────────────────────────────────

  @SiteRoute("POST", "/api/mobile/auth/login", { auth: "none" })
  async login(@Req() req: FastifyRequest, @RawBody() raw: Buffer): Promise<Response> {
    const { login, password } = loginBodySchema.parse(parseJsonBody(raw));
    const tooMany = await this.checkLoginLimit(req, login);
    if (tooMany) return tooMany;
    try {
      const result = await this.identityAuth.login({ login, password, locale: "ru" });
      if (result.kind === "second_factor") {
        return Response.json({ twoFactor: true, ticket: issueTicket(result.userId) });
      }
      return await this.finishStaffSession(result);
    } catch (err) {
      return this.mapAuthFailure(err);
    }
  }

  @SiteRoute("POST", "/api/mobile/auth/2fa", { auth: "none" })
  async secondFactor(@Req() req: FastifyRequest, @RawBody() raw: Buffer): Promise<Response> {
    const { ticket, code } = secondFactorBodySchema.parse(parseJsonBody(raw));
    const userId = readTicket(ticket);
    if (!userId) throw new ApiError(401, "unauthorized");
    const tooMany = await this.checkLoginLimit(req, `2fa:${userId}`);
    if (tooMany) return tooMany;
    try {
      const result = await this.identityAuth.completeSecondFactor(userId, code, "ru");
      return await this.finishStaffSession(result);
    } catch (err) {
      return this.mapAuthFailure(err);
    }
  }

  @SiteRoute("POST", "/api/mobile/auth/logout", { auth: "user" })
  async logout(@SessionToken() token: string | null): Promise<Response> {
    await this.identityAuth.logout(token ?? undefined);
    return Response.json({ ok: true });
  }

  // ─── Профиль, смена, «Мой день», «Обзор», сотрудники, уведомления, push, веб-сессия (8 путей) ──

  @SiteRoute("POST", "/api/mobile/me/shift", { auth: "staff" })
  setShift(
    @Req() req: FastifyRequest,
    @RawBody() raw: Buffer,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const { onShift } = shiftBodySchema.parse(parseJsonBody(raw));
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      await this.crmMobileApi.setShift(ctx, onShift);
      return Response.json({ ok: true, onShift });
    });
  }

  @SiteRoute("GET", "/api/mobile/me", { auth: "staff" })
  async me(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    const ctx = siteCallContext(req, this.config, staff, token, locale);
    const onShift = await this.crmMobileApi.autoShiftOnVisit(ctx);
    const live = await this.crmMobileApi.live(staff.context);
    return Response.json({
      id: staff.user.id,
      name: staffLabel(staff.user),
      email: staff.user.email,
      role: staff.roleName,
      isOwner: staff.isOwner,
      scope: staff.scope,
      onShift,
      layout: mobileLayout((p) => staff.context.can(p), staff.isOwner),
      permissions: [...staff.permissions],
      counters: live.counters,
      unread: live.unread,
    });
  }

  @SiteRoute("GET", "/api/mobile/today", { auth: "staff" })
  today(@CurrentStaff() staff: StaffMember): Promise<Response> {
    return runMobile(async () => Response.json(await this.crmLists.today(staff)));
  }

  @SiteRoute("GET", "/api/mobile/overview", { auth: "staff" })
  @Permissions("analytics.view")
  overview(@Req() req: FastifyRequest, @CurrentStaff() staff: StaffMember): Promise<Response> {
    return runMobile(async () => {
      const raw = Number(searchParamsOf(req).get("period"));
      const period = OVERVIEW_PERIODS.has(raw) ? raw : 30;
      const canDeals = staff.context.can("deals.view");
      const [d, live, stageCounts, stages] = await Promise.all([
        this.crmMobileApi.dashboard(staff, period),
        this.crmMobileApi.live(staff.context),
        canDeals ? this.crmMobileApi.stageCounts() : Promise.resolve([]),
        canDeals ? this.crmMobileApi.listStages() : Promise.resolve([]),
      ]);
      const f = d.funnelRows.rows[0] ?? { registered: 0, with_book: 0, engaged: 0, ordered: 0, paid: 0 };
      const byStage = new Map(stageCounts.map((s) => [s.stageId, s.n]));
      const avg = (x: { sum: number; n: number }) => (x.n ? Math.round(x.sum / x.n) : 0);
      return Response.json({
        period,
        revenue: { cur: d.cur.sum, prev: d.prev.sum },
        sales: { cur: d.cur.n, prev: d.prev.n },
        avgCheck: { cur: avg(d.cur), prev: avg(d.prev) },
        newClients: { cur: d.newUsers.cur, prev: d.newUsers.prev },
        series: d.daily.map((r) => ({ day: r.d, sum: r.sum, n: r.n })),
        funnel: { registered: f.registered, withBook: f.with_book, engaged: f.engaged, ordered: f.ordered, paid: f.paid },
        byPlan: d.byPlan.map((p) => ({ plan: p.plan, label: planName(p.plan), sum: p.sum, n: p.n })).sort((a, b) => b.sum - a.sum),
        stages: stages.filter((s) => s.kind === "open").map((s) => ({ id: s.id, name: s.name, color: s.color, n: byStage.get(s.id) ?? 0 })),
        attention: { orders: d.attention.length, deadlines: d.deadlines.length + d.dealDeadlines.length },
        counters: live.counters,
      });
    });
  }

  @SiteRoute("GET", "/api/mobile/staff", { auth: "staff" })
  staffList(@CurrentStaff() staff: StaffMember): Promise<Response> {
    return runMobile(async () => Response.json(await this.crmLists.staffList(staff)));
  }

  @SiteRoute("GET", "/api/mobile/notifications", { auth: "staff" })
  notificationsList(@Req() req: FastifyRequest, @CurrentStaff() staff: StaffMember): Promise<Response> {
    return runMobile(async () => {
      const limit = Number(searchParamsOf(req).get("limit")) || 60;
      return Response.json({ notifications: await this.crmLists.notifications(staff.user.id, limit) });
    });
  }

  @SiteRoute("POST", "/api/mobile/notifications", { auth: "staff" })
  notificationsMarkRead(@RawBody() raw: Buffer, @CurrentStaff() staff: StaffMember): Promise<Response> {
    return runMobile(async () => {
      const { id } = notifyReadBodySchema.parse(parseOptionalJsonBody(raw));
      if (id) requireUuid(id);
      await this.crmLists.markNotificationsRead(staff.user.id, id);
      return Response.json({ ok: true });
    });
  }

  @SiteRoute("GET", "/api/mobile/push", { auth: "staff" })
  pushConfig(): Promise<Response> {
    return runMobile(async () =>
      Response.json({
        ios: this.mobileDevices.pushReady("ios"),
        android: this.mobileDevices.androidClientOptions(),
      }),
    );
  }

  @SiteRoute("POST", "/api/mobile/push", { auth: "staff" })
  pushRegister(@RawBody() raw: Buffer, @CurrentStaff() staff: StaffMember): Promise<Response> {
    return runMobile(async () => {
      const parsed = parseJsonBody(raw);
      const merged = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? { platform: "ios", ...parsed } : { platform: "ios" };
      const device = pushDeviceSchema.parse(merged);
      await this.mobileDevices.register(staff.user.id, { ...device, app: "crm" });
      return Response.json({ ok: true, serverReady: this.mobileDevices.pushReady(device.platform) });
    });
  }

  @SiteRoute("DELETE", "/api/mobile/push", { auth: "staff" })
  async pushForget(@RawBody() raw: Buffer, @CurrentStaff() staff: StaffMember): Promise<Response> {
    const { token } = pushForgetSchema.parse(parseJsonBody(raw));
    await this.mobileDevices.forget(staff.user.id, token);
    return Response.json({ ok: true });
  }

  @SiteRoute("POST", "/api/mobile/web-session", { auth: "staff" })
  webSession(@CurrentStaff() staff: StaffMember): Promise<Response> {
    return runMobile(async () => {
      const { token, expiresAt } = await this.identityAuth.openCompanionSession(staff.user.id, WEB_SESSION_TTL_MS);
      return Response.json(
        { cookie: "mb_session", token, expiresAt: expiresAt.toISOString() },
        { headers: { "Cache-Control": "no-store" } },
      );
    });
  }

  // ─── Шаблоны ответов (5 путей: статические /reorder и /draft раньше /{id}) ──

  @SiteRoute("POST", "/api/mobile/templates/reorder", { auth: "staff" })
  @Permissions("chats.view")
  templatesReorder(
    @Req() req: FastifyRequest,
    @RawBody() raw: Buffer,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const { ids } = templatesReorderSchema.parse(parseJsonBody(raw));
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      return Response.json(await this.crmMobileApi.reorderMyTemplates(ctx, ids));
    });
  }

  @SiteRoute("POST", "/api/mobile/templates/draft", { auth: "staff" })
  @Permissions("chats.view")
  templatesDraft(
    @Req() req: FastifyRequest,
    @RawBody() raw: Buffer,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const { chatId, messageId } = templateDraftSchema.parse(parseJsonBody(raw));
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      const r = await this.crmMobileApi.aiTemplateDraft(ctx, chatId, messageId);
      if (!r.ok) return Response.json({ error: r.message }, { status: 400 });
      return Response.json({ title: r.title, text: r.text, replaced: r.replaced, ai: r.ai });
    });
  }

  @SiteRoute("GET", "/api/mobile/templates", { auth: "staff" })
  @Permissions("chats.view")
  templatesList(@CurrentStaff() staff: StaffMember): Promise<Response> {
    return runMobile(async () => {
      const all = await this.crmMobileApi.listTemplates(staff.user.id);
      const pick = ({ id, title, text }: { id: string; title: string; text: string }) => ({ id, title, text });
      return Response.json({ mine: all.filter((t) => t.own).map(pick), shared: all.filter((t) => !t.own).map(pick) });
    });
  }

  @SiteRoute("POST", "/api/mobile/templates", { auth: "staff" })
  @Permissions("chats.view")
  templatesSave(
    @Req() req: FastifyRequest,
    @RawBody() raw: Buffer,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const b = templateSaveSchema.parse(parseJsonBody(raw));
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      const r = await this.crmMobileApi.saveMyTemplate(ctx, b.id ?? "", b.title, b.text);
      return Response.json(r, { status: r.error ? 400 : 200 });
    });
  }

  @SiteRoute("POST", "/api/mobile/templates/{id}/duplicate", { auth: "staff" })
  @Permissions("chats.view")
  templateDuplicate(
    @Param("id") rawId: string,
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      const r = await this.crmMobileApi.duplicateTemplate(ctx, id);
      return Response.json(r, { status: r.error ? 400 : 200 });
    });
  }

  @SiteRoute("DELETE", "/api/mobile/templates/{id}", { auth: "staff" })
  @Permissions("chats.view")
  templateDelete(
    @Param("id") rawId: string,
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      const r = await this.crmMobileApi.deleteMyTemplate(ctx, id);
      return Response.json(r, { status: r.error ? 400 : 200 });
    });
  }

  // ─── Каталог WhatsApp (1 путь) ───────────────────────────────────────────

  @SiteRoute("GET", "/api/mobile/catalog", { auth: "staff" })
  @Permissions("chats.view", "chats.send")
  catalog(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      let r: CrmChatProductsResult;
      try {
        r = await this.crmMobileApi.chatProducts(ctx);
      } catch (err) {
        this.log.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
        return Response.json({ error: admin.mobileCatalogDown }, { status: 503 });
      }
      if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
      return Response.json({ enabled: r.enabled, products: r.products });
    });
  }

  // ─── Звонки (3 пути: статический /dial раньше /{id}/handled) ─────────────

  @SiteRoute("POST", "/api/mobile/calls/dial", { auth: "staff" })
  @Permissions("calls.make")
  callsDial(
    @Req() req: FastifyRequest,
    @RawBody() raw: Buffer,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const t = callDialSchema.parse(parseJsonBody(raw));
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      const r = await this.crmMobileApi.callDial(ctx, {
        dealId: t.dealId ?? undefined,
        orderId: t.orderId ?? undefined,
        clientId: t.clientId ?? undefined,
        callId: t.callId ?? undefined,
      });
      return Response.json(r, { status: r.ok ? 200 : 400 });
    });
  }

  @SiteRoute("POST", "/api/mobile/calls/{id}/handled", { auth: "staff" })
  @Permissions("calls.view")
  callHandled(
    @Param("id") rawId: string,
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      const r = await this.crmMobileApi.markCallHandled(ctx, id);
      return Response.json(r, { status: r.ok ? 200 : 400 });
    });
  }

  @SiteRoute("GET", "/api/mobile/calls", { auth: "staff" })
  @Permissions("calls.view")
  callsList(@Req() req: FastifyRequest, @CurrentStaff() staff: StaffMember): Promise<Response> {
    return runMobile(async () => {
      const u = searchParamsOf(req);
      const f = u.get("f");
      const filter = f === "missed" || f === "in" || f === "out" || f === "mine" ? f : "all";
      const days = Math.min(60, Math.max(1, Number(u.get("days")) || 14));
      return Response.json(await this.crmLists.calls(staff, filter, days));
    });
  }

  // ─── Счета (3 пути: статический /info раньше /{id}) ─────────────────────

  @SiteRoute("GET", "/api/mobile/invoices/info", { auth: "staff" })
  @Permissions("chats.send", "deals.edit")
  invoicesInfo(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const u = searchParamsOf(req);
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      const r = await this.ports.invoiceFormInfo(ctx, {
        dealId: u.get("dealId") ?? undefined,
        conversationId: u.get("conversationId") ?? undefined,
      });
      return Response.json(r, { status: r.ok ? 200 : 400 });
    });
  }

  @SiteRoute("POST", "/api/mobile/invoices/{id}", { auth: "staff" })
  @Permissions("deals.edit")
  invoiceAction(
    @Param("id") rawId: string,
    @Req() req: FastifyRequest,
    @RawBody() raw: Buffer,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      const { action } = invoiceActionSchema.parse(parseJsonBody(raw));
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      const r = action === "cancel" ? await this.ports.cancelInvoice(ctx, id) : await this.ports.resendInvoice(ctx, id);
      return Response.json(r, { status: r.ok ? 200 : 400 });
    });
  }

  @SiteRoute("POST", "/api/mobile/invoices", { auth: "staff" })
  @Permissions("chats.send", "deals.edit")
  invoiceIssue(
    @Req() req: FastifyRequest,
    @RawBody() raw: Buffer,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      const r = await this.ports.issueInvoice(ctx, parseJsonBody(raw));
      return Response.json(r, { status: r.ok ? 200 : 400 });
    });
  }

  // ─── Заказы для производства (3 пути) ────────────────────────────────────

  @SiteRoute("GET", "/api/mobile/orders", { auth: "staff" })
  @Permissions("orders.view")
  ordersList(@CurrentStaff() staff: StaffMember): Promise<Response> {
    return runMobile(async () => Response.json(await this.crmLists.orders(staff)));
  }

  @SiteRoute("GET", "/api/mobile/orders/{id}", { auth: "staff" })
  @Permissions("orders.view")
  orderDetail(@Param("id") rawId: string, @CurrentStaff() staff: StaffMember): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      return Response.json(await this.crmLists.orderDetail(staff, id));
    });
  }

  @SiteRoute("POST", "/api/mobile/orders/{id}/status", { auth: "staff" })
  @Permissions("orders.view", "orders.edit")
  orderMoveStatus(
    @Param("id") rawId: string,
    @Req() req: FastifyRequest,
    @RawBody() raw: Buffer,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      const { status } = orderStatusSchema.parse(parseJsonBody(raw));
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      const r = await this.crmMobileApi.moveOrder(ctx, id, status);
      return Response.json(r, { status: r.error ? 400 : 200 });
    });
  }
}
