/**
 * Команда и общие шаблоны ответов в приложении CRM — те же данные и действия, что у страниц «Команда» и вкладки «CRM».
 */
import { apiStaff } from "@/server/api";
import { container } from "@/server/container";
import { formatDate } from "@/lib/dates";
import { templateVars } from "@/shared/domain/templates";
import { createStaffAction, resetStaffPasswordAction, revokeStaffAction, setStaffDisabledAction, setStaffExtensionAction, setStaffPhoneAction, setStaffRoleAction } from "@/server/crm-actions/team";
import { deleteTemplateAction, saveTemplateAction } from "@/server/crm-actions/settings-crm";
import { savePricingAction } from "@/server/crm-actions/pricing";
import { saveSellerAction, setGiftNoteAction, setMaxPhotosAction, setRegistrationAction } from "@/server/crm-actions/site";
import { factorySeller, getSellerOverrides, giftNoteEnabled, registrationOpen } from "@/config/site";
import { maxPhotos } from "@/server/photoLimit";
import { MAX_PHOTOS_CEILING } from "@/modules/authoring/domain/Photo";
import { ensureCatalog } from "@/server/catalog";
import { factoryCatalog, getAddons, getAiPacks, getDeliveryOptions, getFreeMediaMinutes, getMediaPacks, getPlans, isAbroadDelivery } from "@/config/site";
import { addonLabels, deliveryLabels, planLabels } from "@/modules/ordering/ui/labels";
import type { Handlers } from "../../app";
import { refused } from "./common";

const done = (message: string | null) => ({ ok: true as const, message });

/** Отказ действия сайта посреди нескольких шагов — текстом сотруднику (остальные ошибки — наверх). */
class Refusal extends Error {}

type Admin = "crmSite" | "crmSiteSave" | "crmPricing" | "crmPricingSave" | "crmTeam" | "crmTeamInvite" | "crmTeamMember" | "crmTeamRevoke" | "crmTeamPassword" | "crmTemplates" | "crmTemplateSave" | "crmTemplateDelete";

type Field = { key: string; label: string; kind: "money" | "number" | "switch"; value: string; hint: string | null; optional: boolean };
const f = (key: string, label: string, kind: Field["kind"], value: string | number | boolean, hint: string | null = null, optional = false): Field => ({ key, label, kind, value: kind === "switch" ? (value ? "on" : "") : String(value), hint, optional });

export const crmAdminHandlers: Pick<Handlers, Admin> = {
  async crmSite({ req }) {
    await apiStaff(req, "settings.manage");
    await ensureCatalog();
    const o = getSellerOverrides();
    return {
      registration: registrationOpen(),
      giftNote: giftNoteEnabled(),
      maxPhotos: await maxPhotos(),
      maxPhotosCeiling: MAX_PHOTOS_CEILING,
      seller: { legalName: o.legalName ?? "", bin: o.bin ?? "", phone: o.phone ?? "", whatsapp: o.whatsapp ?? "" },
      sellerPlaceholder: { legalName: factorySeller.legalName, bin: factorySeller.bin, phone: factorySeller.phone, whatsapp: factorySeller.whatsapp },
    };
  },

  async crmSiteSave({ req, input }) {
    await apiStaff(req, "settings.manage");
    const b = input.body;
    const messages: string[] = [];
    const step = async (fields: Record<string, string>, action: (s: object, f: FormData) => Promise<{ ok?: string; error?: string }>) => {
      const form = new FormData();
      for (const [k, v] of Object.entries(fields)) if (v !== "") form.set(k, v);
      const r = await action({}, form);
      if (r.error) throw new Refusal(r.error);
      if (r.ok) messages.push(r.ok);
    };
    try {
      if (b.registration !== undefined) await step({ registration: b.registration ? "on" : "" }, setRegistrationAction);
      if (b.giftNote !== undefined) await step({ giftNote: b.giftNote ? "on" : "" }, setGiftNoteAction);
      if (b.maxPhotos !== undefined) await step({ maxPhotos: String(b.maxPhotos) }, setMaxPhotosAction);
      if (b.seller) await step({ ...b.seller }, saveSellerAction);
    } catch (err) {
      if (err instanceof Refusal) return refused(err.message);
      throw err;
    }
    return done(messages.join(" ") || "Сохранено");
  },

  async crmPricing({ req }) {
    await apiStaff(req, "settings.manage");
    await ensureCatalog();
    const plans = getPlans();
    const addons = getAddons();
    const delivery = getDeliveryOptions();
    const ai = getAiPacks();
    const media = getMediaPacks();
    const fac = JSON.stringify([factoryCatalog.plans.map((p) => [p.price, p.extraCopyPrice, p.hidden]), factoryCatalog.addons.map((a) => a.price), factoryCatalog.delivery.map((d) => d.price)]);
    const cur = JSON.stringify([plans.map((p) => [p.price, p.extraCopyPrice, p.hidden]), addons.map((a) => a.price), delivery.map((d) => d.price)]);
    return {
      changed: fac !== cur,
      sections: [
        {
          title: "Тарифы",
          fields: plans.flatMap((p) => [
            f(`plan_${p.id}_price`, `${planLabels[p.id]}: цена`, "money", p.price),
            ...(p.printed ? [f(`plan_${p.id}_extra`, `${planLabels[p.id]}: ещё экземпляр`, "money", p.extraCopyPrice ?? 0)] : []),
            f(`plan_${p.id}_visible`, `${planLabels[p.id]}: продаётся`, "switch", !p.hidden),
          ]),
        },
        { title: "Допы", fields: addons.flatMap((a) => [f(`addon_${a.id}_price`, addonLabels[a.id], "money", a.price), f(`addon_${a.id}_visible`, `${addonLabels[a.id]}: доступен`, "switch", !a.hidden)]) },
        {
          title: "Доставка",
          fields: delivery
            .filter((d) => !isAbroadDelivery(d.id))
            .map((d) => f(`delivery_${d.id}_price`, deliveryLabels[d.id], "money", d.quoted ? "" : d.price, d.quoted ? "пусто — рассчитывается индивидуально" : null, !!factoryCatalog.delivery.find((x) => x.id === d.id)?.quoted)),
        },
        {
          title: "Пакеты ИИ-дизайнера",
          fields: ai.flatMap((p, i) => [f(`ai_${p.id}_requests`, `Пакет ${i + 1}: запросов`, "number", p.requests), f(`ai_${p.id}_price`, `Пакет ${i + 1}: цена`, "money", p.price), f(`ai_${p.id}_visible`, `Пакет ${i + 1}: продаётся`, "switch", !p.hidden)]),
        },
        {
          title: "Видео и аудио",
          fields: [
            f("media_free_minutes", "Бесплатных минут на книгу", "number", getFreeMediaMinutes()),
            ...media.flatMap((p, i) => [f(`media_${p.id}_minutes`, `Пакет ${i + 1}: минут`, "number", p.minutes), f(`media_${p.id}_price`, `Пакет ${i + 1}: цена`, "money", p.price), f(`media_${p.id}_visible`, `Пакет ${i + 1}: продаётся`, "switch", !p.hidden)]),
          ],
        },
      ],
    };
  },

  async crmPricingSave({ req, input }) {
    await apiStaff(req, "settings.manage");
    const form = new FormData();
    // Переключатель — «on» или поля нет, как у флажка формы сайта.
    for (const [k, v] of Object.entries(input.body.values)) if (!(k.endsWith("_visible") && v !== "on")) form.set(k, v);
    const r = await savePricingAction({}, form);
    if (r.error) return refused(r.error);
    return done(r.warning ? `${r.ok ?? "Сохранено"}. ${r.warning}` : (r.ok ?? "Цены сохранены"));
  },

  async crmTeam({ req }) {
    const staff = await apiStaff(req, "team.manage");
    const [roles, members] = await Promise.all([container().access.queries.roles(), container().access.queries.team()]);
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
  },

  async crmTeamInvite({ req, input }) {
    await apiStaff(req, "team.manage");
    const form = new FormData();
    for (const [k, v] of Object.entries(input.body)) form.set(k, String(v ?? ""));
    const r = await createStaffAction({}, form);
    if (r.error) return refused(r.error);
    return done(typeof r.ok === "string" ? r.ok : "Сотрудник добавлен");
  },

  async crmTeamMember({ req, input }) {
    await apiStaff(req, "team.manage");
    const b = input.body;
    const id = input.userId;
    if (b.roleId) await setStaffRoleAction(id, b.roleId);
    if (b.extension !== undefined) await setStaffExtensionAction(id, b.extension);
    if (b.phone !== undefined) {
      const r = await setStaffPhoneAction(id, b.phone);
      if (!r.ok) return refused(r.message);
    }
    if (b.disabled !== undefined) await setStaffDisabledAction(id, b.disabled);
    return done("Сохранено");
  },

  async crmTeamRevoke({ req, input }) {
    await apiStaff(req, "team.manage");
    await revokeStaffAction(input.userId);
    return done("Доступ к CRM забран");
  },

  async crmTeamPassword({ req, input }) {
    await apiStaff(req, "team.manage");
    const r = await resetStaffPasswordAction(input.userId);
    if (!r.ok) return refused(r.message);
    return done(r.message);
  },

  async crmTemplates({ req }) {
    await apiStaff(req, "settings.manage");
    const list = await container().workspace.templates.list();
    return { templates: list.map((t) => ({ id: t.id, title: t.title, text: t.text })), vars: [...templateVars] };
  },

  async crmTemplateSave({ req, input }) {
    await apiStaff(req, "settings.manage");
    const form = new FormData();
    form.set("id", input.body.id ?? "");
    form.set("title", input.body.title);
    form.set("text", input.body.text);
    const r = await saveTemplateAction({}, form);
    if (r.error) return refused(r.error);
    return done("Шаблон сохранён");
  },

  async crmTemplateDelete({ req, input }) {
    await apiStaff(req, "settings.manage");
    await deleteTemplateAction(input.id);
    return done("Шаблон удалён");
  },
};
