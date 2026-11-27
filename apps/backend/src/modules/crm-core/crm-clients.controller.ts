import { Controller, Inject, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { Output, Parsed } from "@mybook/contracts";
import { getVisiblePlans } from "@/config/site";
import type { Locale } from "@/i18n/config";
import { staffOptions } from "@/modules/access/ui";
import { planLabels } from "@/modules/ordering/ui/labels";
import { buildNewClientForm, CRM_LOCALES, fieldsOut, fieldsToForm, refusedResponse } from "@/modules/sales/ui/crm-forms";
import { channelOf, channels, isManualChannel, manualChannels, toAttribution } from "@/shared/domain/channels";
import type { StaffMember } from "../../core/auth/staff";
import { CurrentStaff, Permissions } from "../../core/auth/staff.decorators";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { ApiError } from "../../core/errors/api-error";
import { clientIp } from "../../core/http/client-ip";
import { Input, RequestLocale, SessionToken } from "../../core/http/decorators";
import { Endpoint } from "../../core/http/endpoint";
import { CRM_CLIENTS_PORTS, type CrmClientsPorts, type CrmRequestMeta } from "./crm-core.tokens";

class ClientUpdateRefusal extends Error {}

/**
 * Контекст 4A — клиенты CRM и загрузка чека предоплаты к сделке (7 маршрутов API v1):
 * выдача доступа, напоминание, форма и правка клиента, справочники и создание нового клиента, чек сделки.
 */
@Controller()
export class CrmClientsController {
  constructor(
    @Inject(CRM_CLIENTS_PORTS) private readonly clients: CrmClientsPorts,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private metaOf(staff: StaffMember, token: string | null, req: FastifyRequest, locale: Locale): CrmRequestMeta {
    return { staff, token, ip: clientIp(req, this.config.edgeIpSecret), locale };
  }

  @Endpoint("crmClientAccess")
  @Permissions("clients.create")
  async clientAccess(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @Req() req: FastifyRequest,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmClientAccess">,
  ): Promise<Output<"crmClientAccess"> | Response> {
    const r = await this.clients.issueClientAccess(this.metaOf(staff, token, req, locale), input.clientId);
    if (r.error || !r.password) return refusedResponse(r.error ?? "Не удалось выдать пароль");
    return { login: r.loginText ?? "", password: r.password, message: r.message ?? "" };
  }

  @Endpoint("crmClientRemind")
  @Permissions("clients.edit")
  async clientRemind(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @Req() req: FastifyRequest,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmClientRemind">,
  ): Promise<Output<"crmClientRemind"> | Response> {
    const r = await this.clients.remindClient(this.metaOf(staff, token, req, locale), input.clientId);
    if (!r.ok) return refusedResponse(r.message);
    return { ok: true, message: r.message };
  }

  @Endpoint("crmClientForm")
  @Permissions("clients.view")
  async clientForm(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"crmClientForm">): Promise<Output<"crmClientForm">> {
    const client = await this.clients.clientById(input.clientId);
    if (!client || client.role !== "user" || !staff.context.canSee(client.managerId)) throw new ApiError(404, "notFound");
    const [defs, noMarketing, admins] = await Promise.all([
      this.clients.listFields("client"),
      this.clients.noMarketingFor({ clientId: client.id, phones: [client.phone, ...client.extraPhones] }),
      this.clients.allStaff(),
    ]);
    const seesContacts = staff.context.can("clients.contacts");
    const options = staffOptions(admins);
    const channel = channelOf(toAttribution(client.source));
    return {
      id: client.id,
      name: client.name || client.email.split("@")[0],
      phone: seesContacts ? (client.phone ?? "") : null,
      extraPhones: seesContacts ? client.extraPhones : [],
      canEditPhones: staff.context.can("clients.edit", "clients.contacts"),
      tags: client.tags,
      fields: fieldsOut(defs, client.customFields),
      noMarketing: !!noMarketing,
      locale: client.locale,
      locales: [...CRM_LOCALES],
      channel: isManualChannel(channel) ? channel : null,
      channels: manualChannels.map((id) => ({ id, label: channels[id] })),
      managerId: client.managerId,
      // «Только свои» может взять неразобранного себе, но не отдать другому — как на сайте.
      managers: staff.context.canAssignOthers ? options : options.filter((a) => a.id === staff.user.id || a.id === client.managerId),
      canEdit: staff.context.can("clients.edit"),
    };
  }

  @Endpoint("crmClientUpdate")
  @Permissions("clients.edit")
  async clientUpdate(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @Req() req: FastifyRequest,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmClientUpdate">,
  ): Promise<Output<"crmClientUpdate"> | Response> {
    const meta = this.metaOf(staff, token, req, locale);
    const id = input.clientId;
    const b = input.body;
    let message: string | null = null;
    // По одному действию на поле, как кнопки карточки: первое отказавшее — ответом, остальное не трогаем.
    const step = (r: { ok: boolean; message?: string }) => {
      if (!r.ok) throw new ClientUpdateRefusal(r.message ?? "Не удалось сохранить");
      message = r.message ?? message;
    };
    try {
      if (b.extraPhones !== undefined) step(await this.clients.setClientPhones(meta, id, b.extraPhones.join("\n")));
      if (b.tags !== undefined) {
        await this.clients.updateClientTags(meta, id, b.tags);
        message = "Теги сохранены";
      }
      if (b.fields) {
        const form = new FormData();
        form.set("clientId", id);
        fieldsToForm(form, await this.clients.listFields("client"), b.fields);
        const r = await this.clients.setClientFields(meta, form);
        step(r.error ? { ok: false, message: r.error } : { ok: true, message: r.ok });
      }
      if (b.noMarketing !== undefined) step(await this.clients.setClientNoMarketing(meta, id, b.noMarketing));
      if (b.locale !== undefined) step(await this.clients.setClientLocale(meta, id, b.locale));
      if (b.channel !== undefined) step(await this.clients.setClientChannel(meta, id, b.channel));
      if (b.managerId !== undefined) step(await this.clients.setClientManager(meta, id, b.managerId));
    } catch (err) {
      if (err instanceof ClientUpdateRefusal) return refusedResponse(err.message);
      throw err;
    }
    return { ok: true, message: message ?? "Сохранено" };
  }

  @Endpoint("crmClientNewOptions")
  @Permissions("clients.create")
  async clientNewOptions(@CurrentStaff() staff: StaffMember): Promise<Output<"crmClientNewOptions">> {
    const [stages, pipelines, admins, maxDiscount, payForms] = await Promise.all([
      this.clients.listStages(),
      this.clients.listPipelines(),
      this.clients.allStaff(),
      this.clients.discountLimit(staff),
      this.clients.payFormOptions(),
    ]);
    const open = stages.filter((s) => s.kind === "open");
    const options = staffOptions(admins);
    return {
      channels: manualChannels.map((id) => ({ id, label: channels[id] })),
      locales: [...CRM_LOCALES],
      plans: getVisiblePlans().map((p) => ({ id: p.id, label: planLabels[p.id], price: p.price })),
      payForms,
      stages: open.map((s) => ({
        id: s.id,
        label: pipelines.length > 1 ? `${pipelines.find((x) => x.id === s.pipelineId)?.name} · ${s.name}` : s.name,
      })),
      defaultStageId: open.find((s) => s.name === "Взяли в работу")?.id ?? open[0]?.id ?? null,
      managers: staff.context.canAssignOthers ? options : options.filter((a) => a.id === staff.user.id),
      me: staff.user.id,
      canAssign: staff.context.canAssignOthers,
      canDeal: staff.context.can("deals.edit"),
      maxDiscountPercent: maxDiscount,
    };
  }

  @Endpoint("crmClientCreate")
  @Permissions("clients.create")
  async clientCreate(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @Req() req: FastifyRequest,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmClientCreate">,
  ): Promise<Output<"crmClientCreate"> | Response> {
    const form = buildNewClientForm(input.body);
    const r = await this.clients.createClient(this.metaOf(staff, token, req, locale), form);
    if (!r.done) return refusedResponse(r.error ?? "Не удалось завести клиента");
    return r.done;
  }

  @Endpoint("crmDealReceipt")
  @Permissions("deals.edit")
  async dealReceipt(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @Req() req: FastifyRequest,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmDealReceipt">,
  ): Promise<Output<"crmDealReceipt"> | Response> {
    const result = await this.clients.uploadDealReceipt(this.metaOf(staff, token, req, locale), {
      url: new URL(req.url, this.config.appUrl).toString(),
      dealId: input.dealId,
      amount: input.amount,
      paymentId: input.paymentId,
      file: input.files[0],
    });
    if (!result.ok) return result.response;
    return { ok: true, message: "Чек приложен" };
  }
}
