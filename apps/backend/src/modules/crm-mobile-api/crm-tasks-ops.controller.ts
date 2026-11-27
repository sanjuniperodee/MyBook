import { Controller, Inject, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { Output, Parsed } from "@mybook/contracts";
import type { Locale } from "@/i18n/config";
import type { StaffMember } from "../../core/auth/staff";
import { CurrentStaff } from "../../core/auth/staff.decorators";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { ApiError } from "../../core/errors/api-error";
import { Input, RequestLocale, SessionToken } from "../../core/http/decorators";
import { Endpoint } from "../../core/http/endpoint";
import { callContext, okOrRefused } from "./crm-mobile-api.helpers";
import { CRM_MOBILE_API_PORTS, type CrmMobileApiPorts } from "./crm-mobile-api.tokens";

/**
 * Операции с задачами CRM: создание, карточка задачи, правка, удаление, выполнение, отложить и переключение
 * (7 маршрутов из `crmMobileRestRoutes`).
 */
@Controller()
export class CrmTasksOpsController {
  constructor(
    @Inject(CRM_MOBILE_API_PORTS) private readonly ports: CrmMobileApiPorts,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Endpoint("crmTaskCreate")
  async createTask(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmTaskCreate">,
  ): Promise<Output<"crmTaskCreate"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    const form = new FormData();
    for (const [k, v] of Object.entries(input.body)) {
      if (v === undefined) continue;
      if (k === "remindBeforeMin") form.set(k, v === null ? "none" : String(v));
      else form.set(k, String(v));
    }
    return okOrRefused(await this.ports.createTask(ctx, form));
  }

  @Endpoint("crmTaskGet")
  async getTask(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmTaskGet">,
  ): Promise<Output<"crmTaskGet">> {
    const ctx = callContext(req, this.config, staff, token, locale);
    const detail = await this.ports.taskDetail(ctx, input.taskId);
    if (!detail) throw new ApiError(404, "notFound");
    return detail;
  }

  @Endpoint("crmTaskUpdate")
  async updateTask(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmTaskUpdate">,
  ): Promise<Output<"crmTaskUpdate"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    return okOrRefused(await this.ports.updateTask(ctx, input.taskId, input.body));
  }

  @Endpoint("crmTaskDelete")
  async deleteTask(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmTaskDelete">,
  ): Promise<Output<"crmTaskDelete"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    return okOrRefused(await this.ports.deleteTask(ctx, input.taskId));
  }

  @Endpoint("crmTaskComplete")
  async completeTask(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmTaskComplete">,
  ): Promise<Output<"crmTaskComplete"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    return okOrRefused(await this.ports.completeTask(ctx, input.taskId, input.body));
  }

  @Endpoint("crmTaskSnooze")
  async snoozeTask(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmTaskSnooze">,
  ): Promise<Output<"crmTaskSnooze"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    return okOrRefused(await this.ports.snoozeTask(ctx, input.taskId, input.body.by));
  }

  @Endpoint("crmTaskToggle")
  async toggleTask(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmTaskToggle">,
  ): Promise<Output<"crmTaskToggle"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    return okOrRefused(await this.ports.toggleTask(ctx, input.taskId));
  }
}
