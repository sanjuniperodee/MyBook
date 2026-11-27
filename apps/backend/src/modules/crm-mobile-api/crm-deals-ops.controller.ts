import { Controller, Inject, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { Output, Parsed } from "@mybook/contracts";
import type { Locale } from "@/i18n/config";
import type { StaffMember } from "../../core/auth/staff";
import { CurrentStaff, Permissions } from "../../core/auth/staff.decorators";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { Input, RequestLocale, SessionToken } from "../../core/http/decorators";
import { Endpoint } from "../../core/http/endpoint";
import { callContext, okOrRefused, redirectId, refused } from "./crm-mobile-api.helpers";
import { CRM_MOBILE_API_PORTS, type CrmMobileApiPorts } from "./crm-mobile-api.tokens";

/**
 * Операции со сделками: создание, принятие/отклонение заявки, назначение ответственного, перенос по этапам,
 * заметка и создание задачи по сделке (7 маршрутов из `crmMobileRestRoutes`).
 */
@Controller()
export class CrmDealsOpsController {
  constructor(
    @Inject(CRM_MOBILE_API_PORTS) private readonly ports: CrmMobileApiPorts,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Endpoint("crmDealCreate")
  @Permissions("deals.edit")
  async createDeal(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmDealCreate">,
  ): Promise<Output<"crmDealCreate"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    const form = new FormData();
    for (const [k, v] of Object.entries(input.body)) {
      if (v !== undefined) form.set(k, String(v));
    }
    try {
      const r = await this.ports.createDeal(ctx, form);
      return refused(r.error ?? "Не удалось создать сделку");
    } catch (err) {
      const id = redirectId(err);
      if (id) return { ok: true, id };
      throw err;
    }
  }

  @Endpoint("crmDealAccept")
  @Permissions("deals.edit")
  async acceptDeal(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmDealAccept">,
  ): Promise<Output<"crmDealAccept"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    const r = await this.ports.acceptDeal(ctx, input.dealId);
    return r.ok ? { ok: true } : refused(r.message ?? "Не удалось принять заявку");
  }

  @Endpoint("crmDealAssign")
  @Permissions("deals.edit")
  async assignDeal(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmDealAssign">,
  ): Promise<Output<"crmDealAssign"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    const r = await this.ports.assignDeal(ctx, input.dealId, input.body.userId);
    return r.ok ? { ok: true } : refused(r.message ?? "Не удалось назначить ответственного");
  }

  @Endpoint("crmDealMove")
  @Permissions("deals.edit")
  async moveDeal(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmDealMove">,
  ): Promise<Output<"crmDealMove"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    const r = await this.ports.moveDeal(ctx, input.dealId, input.body.stageId, input.body.lostReason);
    return r.ok ? { ok: true } : refused(r.message ?? "Не удалось перенести сделку");
  }

  @Endpoint("crmDealNote")
  @Permissions("deals.edit")
  async addNote(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmDealNote">,
  ): Promise<Output<"crmDealNote"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    const form = new FormData();
    form.set("dealId", input.dealId);
    form.set("text", input.body.text);
    return okOrRefused(await this.ports.addNote(ctx, form));
  }

  @Endpoint("crmDealReject")
  @Permissions("deals.edit")
  async rejectDeal(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmDealReject">,
  ): Promise<Output<"crmDealReject">> {
    const ctx = callContext(req, this.config, staff, token, locale);
    const r = await this.ports.rejectDeal(ctx, input.dealId, input.body.spam, input.body.reason);
    return { requested: r.requested, message: r.message, deleted: !!r.deleted };
  }

  @Endpoint("crmDealTaskCreate")
  async createDealTask(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmDealTaskCreate">,
  ): Promise<Output<"crmDealTaskCreate"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    const form = new FormData();
    form.set("dealId", input.dealId);
    form.set("title", input.body.title);
    if (input.body.dueAt) form.set("dueAt", input.body.dueAt);
    if (input.body.dueTime) form.set("dueTime", input.body.dueTime);
    if (input.body.kind) form.set("kind", input.body.kind);
    return okOrRefused(await this.ports.createTask(ctx, form));
  }
}
