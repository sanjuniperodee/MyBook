import { Controller, Inject, Param, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import type { Locale } from "@/i18n/config";
import type { StaffMember } from "../../core/auth/staff";
import { CurrentStaff, Permissions } from "../../core/auth/staff.decorators";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { ApiError } from "../../core/errors/api-error";
import { RequestLocale, SessionToken } from "../../core/http/decorators";
import { RawBody, SiteRoute } from "../../core/http/site-route";
import { CRM_LISTS_PORTS, type CrmListsPorts } from "../crm-core/crm-core.tokens";
import { CRM_MOBILE_API_PORTS, type CrmMobileApiPorts } from "../crm-mobile-api/crm-mobile-api.tokens";
import {
  parseJsonBody,
  redirectId,
  requireUuid,
  runMobile,
  searchParamsOf,
  siteCallContext,
} from "./crm-mobile-site.helpers";

const dealCreateSchema = z.object({
  title: z.string().min(2).max(200),
  contactName: z.string().max(120).optional(),
  contactPhone: z.string().max(40).optional(),
  amount: z.number().int().min(0).optional(),
  source: z.string().optional(),
  stageId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
});

const dealAssignSchema = z.object({ userId: z.string().uuid().nullable() });
const dealMoveSchema = z.object({ stageId: z.string().uuid(), lostReason: z.string().max(200).optional() });
const dealNoteSchema = z.object({ text: z.string().min(1).max(5000) });
const dealRejectSchema = z.object({ spam: z.boolean().default(false), reason: z.string().max(200).default("") });
const dealTaskSchema = z.object({
  title: z.string().min(2).max(300),
  dueAt: z.string().optional(),
  dueTime: z.string().optional(),
  kind: z.enum(["task", "call", "message", "meeting"]).optional(),
});

const taskCreateSchema = z.object({
  title: z.string().min(2).max(300),
  dueAt: z.string().optional(),
  dueTime: z.string().optional(),
  kind: z.enum(["task", "call", "message", "meeting"]).optional(),
  remindBeforeMin: z.union([z.number().int().min(0).max(10080), z.literal("none")]).optional(),
  dealId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
});

const taskPatchSchema = z.object({
  title: z.string().min(2).max(300).optional(),
  kind: z.enum(["task", "call", "message", "meeting"]).optional(),
  dueAt: z.string().nullable().optional(),
  remindBeforeMin: z.string().nullable().optional(),
  assigneeId: z.string().uuid().optional(),
  result: z.string().max(1000).optional(),
});

const taskCompleteSchema = z.object({
  result: z.string().max(500).optional(),
  nextTitle: z.string().max(300).optional(),
  nextDue: z.string().max(20).optional(),
});

const taskSnoozeSchema = z.object({ by: z.enum(["hour", "tomorrow"]) });

const DEAL_FILTER_KEYS = ["p", "mine", "a", "q", "task", "stale", "src"] as const;

/**
 * Старое мобильное приложение CRM — сделки, клиенты и задачи (15 путей, 19 HTTP-обработчиков).
 */
@Controller()
export class MobileDealsClientsSiteController {
  constructor(
    @Inject(CRM_LISTS_PORTS) private readonly crmLists: CrmListsPorts,
    @Inject(CRM_MOBILE_API_PORTS) private readonly crmMobileApi: CrmMobileApiPorts,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ─── Сделки (8 путей, 9 обработчиков) ────────────────────────────────────

  @SiteRoute("GET", "/api/mobile/deals", { auth: "staff" })
  @Permissions("deals.view")
  dealsList(@Req() req: FastifyRequest, @CurrentStaff() staff: StaffMember): Promise<Response> {
    return runMobile(async () => {
      const u = searchParamsOf(req);
      const sp: Record<string, string | undefined> = {};
      for (const k of DEAL_FILTER_KEYS) sp[k] = u.get(k) ?? undefined;
      return Response.json(await this.crmLists.deals(staff, sp));
    });
  }

  @SiteRoute("POST", "/api/mobile/deals", { auth: "staff" })
  @Permissions("deals.edit")
  dealCreate(
    @Req() req: FastifyRequest,
    @RawBody() raw: Buffer,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const b = dealCreateSchema.parse(parseJsonBody(raw));
      const form = new FormData();
      for (const [k, v] of Object.entries(b)) {
        if (v !== undefined) form.set(k, String(v));
      }
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      try {
        const r = await this.crmMobileApi.createDeal(ctx, form);
        return Response.json(r, { status: 400 });
      } catch (err) {
        const id = redirectId(err);
        if (id) return Response.json({ ok: true, id });
        throw err;
      }
    });
  }

  @SiteRoute("GET", "/api/mobile/deals/{id}", { auth: "staff" })
  @Permissions("deals.view")
  dealDetail(@Param("id") rawId: string, @CurrentStaff() staff: StaffMember): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      return Response.json(await this.crmLists.dealDetail(staff, id));
    });
  }

  @SiteRoute("POST", "/api/mobile/deals/{id}/accept", { auth: "staff" })
  @Permissions("deals.edit")
  dealAccept(
    @Param("id") rawId: string,
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      const r = await this.crmMobileApi.acceptDeal(ctx, id);
      return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.message }, { status: 400 });
    });
  }

  @SiteRoute("POST", "/api/mobile/deals/{id}/assign", { auth: "staff" })
  @Permissions("deals.edit")
  dealAssign(
    @Param("id") rawId: string,
    @Req() req: FastifyRequest,
    @RawBody() raw: Buffer,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      const { userId } = dealAssignSchema.parse(parseJsonBody(raw));
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      const r = await this.crmMobileApi.assignDeal(ctx, id, userId);
      return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.message }, { status: 400 });
    });
  }

  @SiteRoute("POST", "/api/mobile/deals/{id}/move", { auth: "staff" })
  @Permissions("deals.edit")
  dealMove(
    @Param("id") rawId: string,
    @Req() req: FastifyRequest,
    @RawBody() raw: Buffer,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      const b = dealMoveSchema.parse(parseJsonBody(raw));
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      const r = await this.crmMobileApi.moveDeal(ctx, id, b.stageId, b.lostReason);
      return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.message }, { status: 400 });
    });
  }

  @SiteRoute("POST", "/api/mobile/deals/{id}/notes", { auth: "staff" })
  @Permissions("deals.edit")
  dealAddNote(
    @Param("id") rawId: string,
    @Req() req: FastifyRequest,
    @RawBody() raw: Buffer,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      const { text } = dealNoteSchema.parse(parseJsonBody(raw));
      const form = new FormData();
      form.set("dealId", id);
      form.set("text", text);
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      const r = await this.crmMobileApi.addNote(ctx, form);
      return Response.json(r, { status: r.error ? 400 : 200 });
    });
  }

  @SiteRoute("POST", "/api/mobile/deals/{id}/reject", { auth: "staff" })
  @Permissions("deals.edit")
  dealReject(
    @Param("id") rawId: string,
    @Req() req: FastifyRequest,
    @RawBody() raw: Buffer,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      const b = dealRejectSchema.parse(parseJsonBody(raw));
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      return Response.json(await this.crmMobileApi.rejectDeal(ctx, id, b.spam, b.reason));
    });
  }

  @SiteRoute("POST", "/api/mobile/deals/{id}/tasks", { auth: "staff" })
  dealCreateTask(
    @Param("id") rawId: string,
    @Req() req: FastifyRequest,
    @RawBody() raw: Buffer,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      const b = dealTaskSchema.parse(parseJsonBody(raw));
      const form = new FormData();
      form.set("dealId", id);
      form.set("title", b.title);
      if (b.dueAt) form.set("dueAt", b.dueAt);
      if (b.dueTime) form.set("dueTime", b.dueTime);
      if (b.kind) form.set("kind", b.kind);
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      const r = await this.crmMobileApi.createTask(ctx, form);
      return Response.json(r, { status: r.error ? 400 : 200 });
    });
  }

  // ─── Клиенты (2 пути) ────────────────────────────────────────────────────

  @SiteRoute("GET", "/api/mobile/clients", { auth: "staff" })
  @Permissions("clients.view")
  clientsList(@Req() req: FastifyRequest, @CurrentStaff() staff: StaffMember): Promise<Response> {
    return runMobile(async () => {
      const u = searchParamsOf(req);
      const sort = u.get("sort");
      return Response.json(
        await this.crmLists.clients(staff, {
          q: u.get("q")?.slice(0, 100) ?? undefined,
          sort: sort === "ltv" || sort === "active" ? sort : "new",
          page: Math.max(1, Number(u.get("page")) || 1),
          mine: u.get("mine") === "1",
        }),
      );
    });
  }

  @SiteRoute("GET", "/api/mobile/clients/{id}", { auth: "staff" })
  @Permissions("clients.view")
  clientDetail(@Param("id") rawId: string, @CurrentStaff() staff: StaffMember): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      return Response.json(await this.crmLists.clientCard(staff, id));
    });
  }

  // ─── Задачи (5 путей, 8 обработчиков) ────────────────────────────────────

  @SiteRoute("GET", "/api/mobile/tasks", { auth: "staff" })
  tasksList(@Req() req: FastifyRequest, @CurrentStaff() staff: StaffMember): Promise<Response> {
    return runMobile(async () => {
      const u = searchParamsOf(req);
      return Response.json({
        tasks: await this.crmLists.tasks(staff, {
          done: u.get("done") === "1",
          who: u.get("who") ?? undefined,
          kind: u.get("kind") ?? undefined,
          q: u.get("q")?.slice(0, 100),
        }),
      });
    });
  }

  @SiteRoute("POST", "/api/mobile/tasks", { auth: "staff" })
  taskCreate(
    @Req() req: FastifyRequest,
    @RawBody() raw: Buffer,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const b = taskCreateSchema.parse(parseJsonBody(raw));
      const form = new FormData();
      for (const [k, v] of Object.entries(b)) {
        if (v !== undefined) form.set(k, String(v));
      }
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      const r = await this.crmMobileApi.createTask(ctx, form);
      return Response.json(r, { status: r.error ? 400 : 200 });
    });
  }

  @SiteRoute("GET", "/api/mobile/tasks/{id}", { auth: "staff" })
  taskDetail(
    @Param("id") rawId: string,
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      const detail = await this.crmMobileApi.taskDetail(ctx, id);
      if (!detail) throw new ApiError(404, "notFound");
      return Response.json(detail);
    });
  }

  @SiteRoute("PATCH", "/api/mobile/tasks/{id}", { auth: "staff" })
  taskUpdate(
    @Param("id") rawId: string,
    @Req() req: FastifyRequest,
    @RawBody() raw: Buffer,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      const patch = taskPatchSchema.parse(parseJsonBody(raw));
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      const r = await this.crmMobileApi.updateTask(ctx, id, patch);
      return Response.json(r, { status: r.error ? 400 : 200 });
    });
  }

  @SiteRoute("DELETE", "/api/mobile/tasks/{id}", { auth: "staff" })
  taskDelete(
    @Param("id") rawId: string,
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      const r = await this.crmMobileApi.deleteTask(ctx, id);
      return r.error ? Response.json({ error: r.error }, { status: 400 }) : Response.json({ ok: true });
    });
  }

  @SiteRoute("POST", "/api/mobile/tasks/{id}/complete", { auth: "staff" })
  taskComplete(
    @Param("id") rawId: string,
    @Req() req: FastifyRequest,
    @RawBody() raw: Buffer,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      const body = taskCompleteSchema.parse(parseJsonBody(raw));
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      const r = await this.crmMobileApi.completeTask(ctx, id, body);
      return r.error ? Response.json({ error: r.error }, { status: 400 }) : Response.json({ ok: true });
    });
  }

  @SiteRoute("POST", "/api/mobile/tasks/{id}/snooze", { auth: "staff" })
  taskSnooze(
    @Param("id") rawId: string,
    @Req() req: FastifyRequest,
    @RawBody() raw: Buffer,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      const { by } = taskSnoozeSchema.parse(parseJsonBody(raw));
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      const r = await this.crmMobileApi.snoozeTask(ctx, id, by);
      return Response.json(r, { status: r.error ? 400 : 200 });
    });
  }

  @SiteRoute("POST", "/api/mobile/tasks/{id}/toggle", { auth: "staff" })
  taskToggle(
    @Param("id") rawId: string,
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      const r = await this.crmMobileApi.toggleTask(ctx, id);
      return r.error ? Response.json({ error: r.error }, { status: 400 }) : Response.json({ ok: true });
    });
  }
}
