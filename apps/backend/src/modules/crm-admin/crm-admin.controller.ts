import { Controller, Inject, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { Output, Parsed } from "@mybook/contracts";
import {
  factoryCatalog,
  factorySeller,
  getAddons,
  getAiPacks,
  getDeliveryOptions,
  getFreeMediaMinutes,
  getMediaPacks,
  getPlans,
  getSellerOverrides,
  giftNoteEnabled,
  isAbroadDelivery,
  registrationOpen,
} from "@/config/site";
import type { Locale } from "@/i18n/config";
import { formatDate } from "@/lib/dates";
import { MAX_PHOTOS_CEILING } from "@/modules/authoring/domain/Photo";
import { addonLabels, deliveryLabels, planLabels } from "@/modules/ordering/ui/labels";
import { templateVars } from "@/shared/domain/templates";
import type { StaffMember } from "../../core/auth/staff";
import { CurrentStaff, Permissions } from "../../core/auth/staff.decorators";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { Input, RequestLocale, SessionToken } from "../../core/http/decorators";
import { Endpoint } from "../../core/http/endpoint";
import { callContext, done, refused } from "./crm-admin.helpers";
import { CRM_ADMIN_PORTS, type CrmAdminPorts, type CrmFormState } from "./crm-admin.tokens";

interface PricingField {
  key: string;
  label: string;
  kind: "money" | "number" | "switch";
  value: string;
  hint: string | null;
  optional: boolean;
}

const field = (
  key: string,
  label: string,
  kind: PricingField["kind"],
  value: string | number | boolean,
  hint: string | null = null,
  optional = false,
): PricingField => ({
  key,
  label,
  kind,
  value: kind === "switch" ? (value ? "on" : "") : String(value),
  hint,
  optional,
});

/** Отказ одного из шагов сохранения настроек сайта — прерывает цепочку и возвращается текстом сотруднику. */
class StepRefusal extends Error {}

/**
 * Админка CRM (12 контрактных маршрутов): настройки сайта, цены и тарифы, команда сотрудников
 * и общие шаблоны быстрых ответов.
 */
@Controller()
export class CrmAdminController {
  constructor(
    @Inject(CRM_ADMIN_PORTS) private readonly ports: CrmAdminPorts,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Endpoint("crmSite")
  @Permissions("settings.manage")
  async site(): Promise<Output<"crmSite">> {
    await this.ports.syncCatalogFromSettings();
    const o = getSellerOverrides();
    return {
      registration: registrationOpen(),
      giftNote: giftNoteEnabled(),
      maxPhotos: await this.ports.maxPhotos(),
      maxPhotosCeiling: MAX_PHOTOS_CEILING,
      seller: { legalName: o.legalName ?? "", bin: o.bin ?? "", phone: o.phone ?? "", whatsapp: o.whatsapp ?? "" },
      sellerPlaceholder: {
        legalName: factorySeller.legalName,
        bin: factorySeller.bin,
        phone: factorySeller.phone,
        whatsapp: factorySeller.whatsapp,
      },
    };
  }

  @Endpoint("crmSiteSave")
  @Permissions("settings.manage")
  async siteSave(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmSiteSave">,
  ): Promise<Output<"crmSiteSave"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    const b = input.body;
    const messages: string[] = [];
    const step = async (fields: Record<string, string>, run: (form: FormData) => Promise<CrmFormState>) => {
      const form = new FormData();
      for (const [k, v] of Object.entries(fields)) {
        if (v !== "") form.set(k, v);
      }
      const r = await run(form);
      if (r.error) throw new StepRefusal(r.error);
      if (r.ok) messages.push(r.ok);
    };
    try {
      if (b.registration !== undefined) {
        await step({ registration: b.registration ? "on" : "" }, (f) => this.ports.setRegistration(ctx, f));
      }
      if (b.giftNote !== undefined) {
        await step({ giftNote: b.giftNote ? "on" : "" }, (f) => this.ports.setGiftNote(ctx, f));
      }
      if (b.maxPhotos !== undefined) {
        await step({ maxPhotos: String(b.maxPhotos) }, (f) => this.ports.setMaxPhotos(ctx, f));
      }
      if (b.seller) {
        await step({ ...b.seller }, (f) => this.ports.saveSeller(ctx, f));
      }
    } catch (err) {
      if (err instanceof StepRefusal) return refused(err.message);
      throw err;
    }
    return done(messages.join(" ") || "Сохранено");
  }

  @Endpoint("crmPricing")
  @Permissions("settings.manage")
  async pricing(): Promise<Output<"crmPricing">> {
    await this.ports.syncCatalogFromSettings();
    const plans = getPlans();
    const addons = getAddons();
    const delivery = getDeliveryOptions();
    const ai = getAiPacks();
    const media = getMediaPacks();
    const fac = JSON.stringify([
      factoryCatalog.plans.map((p) => [p.price, p.extraCopyPrice, p.hidden]),
      factoryCatalog.addons.map((a) => a.price),
      factoryCatalog.delivery.map((d) => d.price),
    ]);
    const cur = JSON.stringify([
      plans.map((p) => [p.price, p.extraCopyPrice, p.hidden]),
      addons.map((a) => a.price),
      delivery.map((d) => d.price),
    ]);
    return {
      changed: fac !== cur,
      sections: [
        {
          title: "Тарифы",
          fields: plans.flatMap((p) => [
            field(`plan_${p.id}_price`, `${planLabels[p.id]}: цена`, "money", p.price),
            ...(p.printed ? [field(`plan_${p.id}_extra`, `${planLabels[p.id]}: ещё экземпляр`, "money", p.extraCopyPrice ?? 0)] : []),
            field(`plan_${p.id}_visible`, `${planLabels[p.id]}: продаётся`, "switch", !p.hidden),
          ]),
        },
        {
          title: "Допы",
          fields: addons.flatMap((a) => [
            field(`addon_${a.id}_price`, addonLabels[a.id], "money", a.price),
            field(`addon_${a.id}_visible`, `${addonLabels[a.id]}: доступен`, "switch", !a.hidden),
          ]),
        },
        {
          title: "Доставка",
          fields: delivery
            .filter((d) => !isAbroadDelivery(d.id))
            .map((d) =>
              field(
                `delivery_${d.id}_price`,
                deliveryLabels[d.id],
                "money",
                d.quoted ? "" : d.price,
                d.quoted ? "пусто — рассчитывается индивидуально" : null,
                !!factoryCatalog.delivery.find((x) => x.id === d.id)?.quoted,
              ),
            ),
        },
        {
          title: "Пакеты ИИ-дизайнера",
          fields: ai.flatMap((p, i) => [
            field(`ai_${p.id}_requests`, `Пакет ${i + 1}: запросов`, "number", p.requests),
            field(`ai_${p.id}_price`, `Пакет ${i + 1}: цена`, "money", p.price),
            field(`ai_${p.id}_visible`, `Пакет ${i + 1}: продаётся`, "switch", !p.hidden),
          ]),
        },
        {
          title: "Видео и аудио",
          fields: [
            field("media_free_minutes", "Бесплатных минут на книгу", "number", getFreeMediaMinutes()),
            ...media.flatMap((p, i) => [
              field(`media_${p.id}_minutes`, `Пакет ${i + 1}: минут`, "number", p.minutes),
              field(`media_${p.id}_price`, `Пакет ${i + 1}: цена`, "money", p.price),
              field(`media_${p.id}_visible`, `Пакет ${i + 1}: продаётся`, "switch", !p.hidden),
            ]),
          ],
        },
      ],
    };
  }

  @Endpoint("crmPricingSave")
  @Permissions("settings.manage")
  async pricingSave(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmPricingSave">,
  ): Promise<Output<"crmPricingSave"> | Response> {
    const form = new FormData();
    // Переключатель — «on» или поля нет, как у флажка формы сайта.
    for (const [k, v] of Object.entries(input.body.values)) {
      if (!(k.endsWith("_visible") && v !== "on")) form.set(k, v);
    }
    const ctx = callContext(req, this.config, staff, token, locale);
    const r = await this.ports.savePricing(ctx, form);
    if (r.error) return refused(r.error);
    return done(r.warning ? `${r.ok ?? "Сохранено"}. ${r.warning}` : (r.ok ?? "Цены сохранены"));
  }

  @Endpoint("crmTeam")
  @Permissions("team.manage")
  async team(@CurrentStaff() staff: StaffMember): Promise<Output<"crmTeam">> {
    const [roles, members] = await Promise.all([this.ports.listRoles(), this.ports.listTeam()]);
    const ownerRole = roles.find((r) => r.key === "owner");
    const roleName = new Map(roles.map((r) => [r.id, r.name]));
    return {
      members: members.map(({ user: u, openDeals, calls7d }) => {
        const roleId = u.crmRoleId ?? ownerRole?.id ?? "";
        const isOwner = !u.crmRoleId || u.crmRoleId === ownerRole?.id;
        const isSelf = u.id === staff.user.id;
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          roleId,
          roleName: roleName.get(roleId) ?? "",
          extension: u.sipExtension ?? "",
          phone: u.phone ?? "",
          disabled: u.staffDisabled,
          onShift: u.onShift,
          lastSeen: u.lastSeenAt ? formatDate(u.lastSeenAt, true) : null,
          openDeals,
          calls7d,
          isSelf,
          locked: isSelf || (isOwner && !staff.isOwner),
        };
      }),
      roles: roles.map((r) => ({ id: r.id, label: r.name })),
      inviteRoles: roles.filter((r) => r.key !== "owner" || staff.isOwner).map((r) => ({ id: r.id, label: r.name })),
    };
  }

  @Endpoint("crmTeamInvite")
  @Permissions("team.manage")
  async teamInvite(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmTeamInvite">,
  ): Promise<Output<"crmTeamInvite"> | Response> {
    const form = new FormData();
    for (const [k, v] of Object.entries(input.body)) form.set(k, String(v ?? ""));
    const ctx = callContext(req, this.config, staff, token, locale);
    const r = await this.ports.createStaff(ctx, form);
    if (r.error) return refused(r.error);
    return done(typeof r.ok === "string" ? r.ok : "Сотрудник добавлен");
  }

  @Endpoint("crmTeamMember")
  @Permissions("team.manage")
  async teamMember(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmTeamMember">,
  ): Promise<Output<"crmTeamMember"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    const b = input.body;
    const id = input.userId;
    if (b.roleId) await this.ports.setStaffRole(ctx, id, b.roleId);
    if (b.extension !== undefined) await this.ports.setStaffExtension(ctx, id, b.extension);
    if (b.phone !== undefined) {
      const r = await this.ports.setStaffPhone(ctx, id, b.phone);
      if (!r.ok) return refused(r.message);
    }
    if (b.disabled !== undefined) await this.ports.setStaffDisabled(ctx, id, b.disabled);
    return done("Сохранено");
  }

  @Endpoint("crmTeamRevoke")
  @Permissions("team.manage")
  async teamRevoke(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmTeamRevoke">,
  ): Promise<Output<"crmTeamRevoke">> {
    const ctx = callContext(req, this.config, staff, token, locale);
    await this.ports.revokeStaff(ctx, input.userId);
    return done("Доступ к CRM забран");
  }

  @Endpoint("crmTeamPassword")
  @Permissions("team.manage")
  async teamPassword(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmTeamPassword">,
  ): Promise<Output<"crmTeamPassword"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    const r = await this.ports.resetStaffPassword(ctx, input.userId);
    if (!r.ok) return refused(r.message);
    return done(r.message);
  }

  @Endpoint("crmTemplates")
  @Permissions("settings.manage")
  async templates(): Promise<Output<"crmTemplates">> {
    const list = await this.ports.listSharedTemplates();
    return { templates: list.map((t) => ({ id: t.id, title: t.title, text: t.text })), vars: [...templateVars] };
  }

  @Endpoint("crmTemplateSave")
  @Permissions("settings.manage")
  async templateSave(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmTemplateSave">,
  ): Promise<Output<"crmTemplateSave"> | Response> {
    const form = new FormData();
    form.set("id", input.body.id ?? "");
    form.set("title", input.body.title);
    form.set("text", input.body.text);
    const ctx = callContext(req, this.config, staff, token, locale);
    const r = await this.ports.saveSharedTemplate(ctx, form);
    if (r.error) return refused(r.error);
    return done("Шаблон сохранён");
  }

  @Endpoint("crmTemplateDelete")
  @Permissions("settings.manage")
  async templateDelete(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmTemplateDelete">,
  ): Promise<Output<"crmTemplateDelete">> {
    const ctx = callContext(req, this.config, staff, token, locale);
    await this.ports.deleteSharedTemplate(ctx, input.id);
    return done("Шаблон удалён");
  }
}
