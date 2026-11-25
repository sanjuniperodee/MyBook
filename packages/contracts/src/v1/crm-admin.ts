/**
 * API v1 — управление CRM с телефона: команда (сотрудники: роль, добавочный, телефон для напоминаний, отключить, забрать
 * доступ, сбросить пароль, пригласить) и общие шаблоны быстрых ответов. Те же действия, что у страниц «Команда» и
 * «Интеграции → CRM → Шаблоны» (права team.manage / settings.manage, журнал). Роли и их права, планы продаж — страницы CRM.
 */
import { z } from "zod";
import { route, schemas, uuid, type RouteDef } from "./core";
import { Choice, Done } from "./crm";

export const TeamMember = z
  .object({
    id: uuid,
    name: z.string(),
    email: z.string(),
    roleId: z.string(),
    roleName: z.string(),
    extension: z.string(),
    phone: z.string(),
    disabled: z.boolean(),
    onShift: z.boolean(),
    lastSeen: z.string().nullable(),
    openDeals: z.number().int(),
    calls7d: z.number().int(),
    isSelf: z.boolean(),
    /** Себя и владельца (не владельцу) менять нельзя. */
    locked: z.boolean(),
  })
  .register(schemas, { id: "TeamMember" });

export const Team = z.object({ members: z.array(TeamMember), roles: z.array(Choice), inviteRoles: z.array(Choice) }).register(schemas, { id: "Team" });

export const TeamInviteBody = z
  .object({ email: z.string().trim().email().max(200), name: z.string().trim().max(100).default(""), password: z.string().max(200).default(""), roleId: uuid, extension: z.string().max(10).default("") })
  .strict()
  .register(schemas, { id: "TeamInviteBody" });

/** Правка сотрудника: только переданные поля. */
export const TeamMemberPatch = z
  .object({ roleId: uuid.optional(), extension: z.string().max(10).optional(), phone: z.string().max(30).optional(), disabled: z.boolean().optional() })
  .strict()
  .register(schemas, { id: "TeamMemberPatch" });

export const ReplyTemplate = z.object({ id: uuid, title: z.string(), text: z.string() }).register(schemas, { id: "ReplyTemplate" });
export const ReplyTemplates = z.object({ templates: z.array(ReplyTemplate), vars: z.array(z.string()) }).register(schemas, { id: "ReplyTemplates" });
export const ReplyTemplateBody = z
  .object({ id: uuid.nullable().optional(), title: z.string().trim().min(1).max(60), text: z.string().trim().min(1).max(2000) })
  .strict()
  .register(schemas, { id: "ReplyTemplateBody" });

// ─── Цены и тарифы — форма полями ────────────────────────────────────────────────────────────────────────────────

/** Поле формы настроек: key — имя поля формы сайта; money — тенге, number — целое, switch — вкл/выкл ("on" или ""). */
export const SettingsField = z
  .object({ key: z.string(), label: z.string(), kind: z.enum(["money", "number", "switch"]), value: z.string(), hint: z.string().nullable(), optional: z.boolean() })
  .register(schemas, { id: "SettingsField" });

export const SettingsSection = z.object({ title: z.string(), fields: z.array(SettingsField) }).register(schemas, { id: "SettingsSection" });

export const PricingForm = z.object({ sections: z.array(SettingsSection), changed: z.boolean() }).register(schemas, { id: "PricingForm" });

export const SettingsValuesBody = z.object({ values: z.record(z.string().max(60), z.string().max(40)) }).strict().register(schemas, { id: "SettingsValuesBody" });

// ─── Сайт ────────────────────────────────────────────────────────────────────────────────────────────────────────

export const SellerDetailsOut = z.object({ legalName: z.string(), bin: z.string(), phone: z.string(), whatsapp: z.string() }).register(schemas, { id: "SellerDetails" });

export const SiteSettings = z
  .object({
    /** Регистрация на сайте открыта. */
    registration: z.boolean(),
    /** Поле «Текст открытки» при оформлении заказа. */
    giftNote: z.boolean(),
    maxPhotos: z.number().int(),
    maxPhotosCeiling: z.number().int(),
    /** Реквизиты продавца (пусто — заглушка из настроек сайта, она в placeholder). */
    seller: SellerDetailsOut,
    sellerPlaceholder: SellerDetailsOut,
  })
  .register(schemas, { id: "SiteSettings" });

/** Только переданные поля; каждое — тем же действием, что форма страницы «Сайт». */
export const SiteSettingsPatch = z
  .object({ registration: z.boolean().optional(), giftNote: z.boolean().optional(), maxPhotos: z.number().int().optional(), seller: SellerDetailsOut.optional() })
  .strict()
  .register(schemas, { id: "SiteSettingsPatch" });

const UserParams = z.object({ userId: uuid });

export const crmAdminRoutes = {
  crmTeam: route({ method: "GET", path: "/api/v1/crm/team", auth: "staff", tag: "crm", summary: "Команда: сотрудники и роли", response: Team }),
  crmTeamInvite: route({ method: "POST", path: "/api/v1/crm/team", auth: "staff", tag: "crm", summary: "Добавить сотрудника (почта, роль; пароль — свой или придумает система)", body: TeamInviteBody, response: Done }),
  crmTeamMember: route({ method: "PATCH", path: "/api/v1/crm/team/{userId}", auth: "staff", tag: "crm", summary: "Роль, добавочный, телефон для напоминаний, отключить или включить", params: UserParams, body: TeamMemberPatch, response: Done }),
  crmTeamRevoke: route({ method: "POST", path: "/api/v1/crm/team/{userId}/revoke", auth: "staff", tag: "crm", summary: "Забрать доступ к CRM (аккаунт станет клиентским)", params: UserParams, response: Done }),
  crmTeamPassword: route({ method: "POST", path: "/api/v1/crm/team/{userId}/password", auth: "staff", tag: "crm", summary: "Сбросить пароль сотрудника — новый придёт ему на почту", params: UserParams, response: Done }),
  crmTemplates: route({ method: "GET", path: "/api/v1/crm/templates", auth: "staff", tag: "crm", summary: "Общие шаблоны быстрых ответов и переменные", response: ReplyTemplates }),
  crmTemplateSave: route({ method: "POST", path: "/api/v1/crm/templates", auth: "staff", tag: "crm", summary: "Новый шаблон или правка", body: ReplyTemplateBody, response: Done }),
  crmTemplateDelete: route({ method: "DELETE", path: "/api/v1/crm/templates/{id}", auth: "staff", tag: "crm", summary: "Удалить шаблон", params: z.object({ id: uuid }), response: Done }),
  crmPricing: route({ method: "GET", path: "/api/v1/crm/pricing", auth: "staff", tag: "crm", summary: "Цены и тарифы полями: тарифы, допы, доставка, пакеты ИИ и видео", response: PricingForm }),
  crmPricingSave: route({ method: "PUT", path: "/api/v1/crm/pricing", auth: "staff", tag: "crm", summary: "Сохранить цены (всё разом, как форма сайта)", body: SettingsValuesBody, response: Done }),
  crmSite: route({ method: "GET", path: "/api/v1/crm/site", auth: "staff", tag: "crm", summary: "Сайт: регистрация, открытка, предел фото, реквизиты продавца", response: SiteSettings }),
  crmSiteSave: route({ method: "PATCH", path: "/api/v1/crm/site", auth: "staff", tag: "crm", summary: "Изменить настройки сайта (только переданные)", body: SiteSettingsPatch, response: Done }),
} satisfies Record<string, RouteDef>;
