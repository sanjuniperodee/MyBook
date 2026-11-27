import { Controller, Inject, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { Output, Parsed } from "@mybook/contracts";
import type { Locale } from "@/i18n/config";
import { planName } from "@/i18n/labels";
import { mobileLayout } from "@/shared/domain/mobileLayout";
import { staffLabel } from "@/shared/domain/staff";
import type { StaffMember } from "../../core/auth/staff";
import { CurrentStaff, Permissions } from "../../core/auth/staff.decorators";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { Input, RequestLocale, SessionToken } from "../../core/http/decorators";
import { Endpoint } from "../../core/http/endpoint";
import { callContext, okOrRefused, refused } from "./crm-mobile-api.helpers";
import { CRM_MOBILE_API_PORTS, type CrmMobileApiPorts } from "./crm-mobile-api.tokens";

const OVERVIEW_PERIODS = new Set([7, 30, 90]);

/**
 * Профиль сотрудника, смена, «Обзор» руководителя, личные шаблоны ответов, звонки и статус заказа на канбане
 * (12 маршрутов из `crmMobileRestRoutes`).
 */
@Controller()
export class CrmWorkController {
  constructor(
    @Inject(CRM_MOBILE_API_PORTS) private readonly ports: CrmMobileApiPorts,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Endpoint("crmMe")
  async me(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Output<"crmMe">> {
    const ctx = callContext(req, this.config, staff, token, locale);
    const onShift = await this.ports.autoShiftOnVisit(ctx);
    const live = await this.ports.live(staff.context);
    return {
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
    };
  }

  @Endpoint("crmShiftSet")
  async setShift(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmShiftSet">,
  ): Promise<Output<"crmShiftSet">> {
    const ctx = callContext(req, this.config, staff, token, locale);
    await this.ports.setShift(ctx, input.body.onShift);
    return { ok: true, onShift: input.body.onShift };
  }

  @Endpoint("crmOverview")
  @Permissions("analytics.view")
  async overview(
    @CurrentStaff() staff: StaffMember,
    @Input() input: Parsed<"crmOverview">,
  ): Promise<Output<"crmOverview">> {
    const period = input.period && OVERVIEW_PERIODS.has(input.period) ? input.period : 30;
    const canDeals = staff.context.can("deals.view");
    const [d, live, stageCounts, stages] = await Promise.all([
      this.ports.dashboard(staff, period),
      this.ports.live(staff.context),
      canDeals ? this.ports.stageCounts() : Promise.resolve([]),
      canDeals ? this.ports.listStages() : Promise.resolve([]),
    ]);
    const f = d.funnelRows.rows[0] ?? { registered: 0, with_book: 0, engaged: 0, ordered: 0, paid: 0 };
    const byStage = new Map(stageCounts.map((s) => [s.stageId, s.n]));
    const avg = (x: { sum: number; n: number }) => (x.n ? Math.round(x.sum / x.n) : 0);
    return {
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
    };
  }

  @Endpoint("crmMyTemplates")
  @Permissions("chats.view")
  async myTemplates(@CurrentStaff() staff: StaffMember): Promise<Output<"crmMyTemplates">> {
    const all = await this.ports.listTemplates(staff.user.id);
    const pick = ({ id, title, text }: { id: string; title: string; text: string }) => ({ id, title, text });
    return { mine: all.filter((t) => t.own).map(pick), shared: all.filter((t) => !t.own).map(pick) };
  }

  @Endpoint("crmMyTemplateSave")
  @Permissions("chats.view")
  async saveMyTemplate(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmMyTemplateSave">,
  ): Promise<Output<"crmMyTemplateSave"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    const r = await this.ports.saveMyTemplate(ctx, input.body.id ?? "", input.body.title, input.body.text);
    if (r.error || !r.id) return refused(r.error ?? "Не удалось сохранить шаблон");
    return { ok: true, id: r.id };
  }

  @Endpoint("crmMyTemplateDelete")
  @Permissions("chats.view")
  async deleteMyTemplate(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmMyTemplateDelete">,
  ): Promise<Output<"crmMyTemplateDelete"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    return okOrRefused(await this.ports.deleteMyTemplate(ctx, input.id));
  }

  @Endpoint("crmMyTemplateDuplicate")
  @Permissions("chats.view")
  async duplicateTemplate(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmMyTemplateDuplicate">,
  ): Promise<Output<"crmMyTemplateDuplicate"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    return okOrRefused(await this.ports.duplicateTemplate(ctx, input.id));
  }

  @Endpoint("crmMyTemplatesReorder")
  @Permissions("chats.view")
  async reorderMyTemplates(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmMyTemplatesReorder">,
  ): Promise<Output<"crmMyTemplatesReorder"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    return okOrRefused(await this.ports.reorderMyTemplates(ctx, input.body.ids));
  }

  @Endpoint("crmMyTemplateDraft")
  @Permissions("chats.view")
  async draftTemplate(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmMyTemplateDraft">,
  ): Promise<Output<"crmMyTemplateDraft"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    const r = await this.ports.aiTemplateDraft(ctx, input.body.chatId, input.body.messageId);
    if (!r.ok) return refused(r.message);
    return {
      title: r.title,
      text: r.text,
      replaced: r.replaced.map((x) => ({ was: x.was, placeholder: x.with })),
      ai: r.ai,
    };
  }

  @Endpoint("crmCallDial")
  @Permissions("calls.make")
  async dialCall(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmCallDial">,
  ): Promise<Output<"crmCallDial"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    const b = input.body;
    const r = await this.ports.callDial(ctx, {
      dealId: b.dealId ?? undefined,
      orderId: b.orderId ?? undefined,
      clientId: b.clientId ?? undefined,
      callId: b.callId ?? undefined,
    });
    return r.ok ? { ok: true, message: r.message ?? null } : refused(r.message ?? "Не удалось позвонить");
  }

  @Endpoint("crmCallHandled")
  @Permissions("calls.view")
  async markCallHandled(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmCallHandled">,
  ): Promise<Output<"crmCallHandled"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    const r = await this.ports.markCallHandled(ctx, input.callId);
    return r.ok ? { ok: true } : refused(r.message ?? "Не удалось отметить звонок");
  }

  @Endpoint("crmOrderStatus")
  @Permissions("orders.view", "orders.edit")
  async moveOrderStatus(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmOrderStatus">,
  ): Promise<Output<"crmOrderStatus"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    return okOrRefused(await this.ports.moveOrder(ctx, input.orderId, input.body.status));
  }
}
