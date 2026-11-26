/**
 * Клиент в приложении CRM: форма правки и сохранение — те же действия, что у карточки клиента на сайте
 * (crm-actions: номера, свои поля, «Не писать первым», язык, канал, ответственный; теги — actions).
 */
import { container } from "@/server/container";
import { apiStaff, HttpError } from "@/server/api";
import { can, canAssignOthers } from "@/server/access";
import { listFields } from "@/modules/workspace";
import { staffOptions } from "@/modules/access/ui";
import { channelOf, channels, isManualChannel, manualChannels, toAttribution } from "@/shared/domain/channels";
import { remindClientAction, updateClientTagsAction } from "@/server/crm-actions/admin";
import { issueClientAccessAction } from "@/server/crm-actions/clients-new";
import { setClientChannelAction, setClientFieldsAction, setClientLocaleAction, setClientManagerAction, setClientNoMarketingAction, setClientPhonesAction } from "@/server/crm-actions/crm";
import type { Handlers } from "../../app";
import { fieldsOut, fieldsToForm, refused } from "./common";

const LOCALES = [
  { id: "ru", label: "Русский" },
  { id: "kk", label: "Казахский" },
  { id: "uz", label: "Узбекский" },
  { id: "en", label: "Английский" },
];

export const crmClientHandlers: Pick<Handlers, "crmClientForm" | "crmClientUpdate" | "crmClientAccess" | "crmClientRemind"> = {
  async crmClientAccess({ req, input }) {
    await apiStaff(req, "clients.create");
    const r = await issueClientAccessAction(input.clientId);
    if (r.error || !r.password) return refused(r.error ?? "Не удалось выдать пароль");
    return { login: r.loginText ?? "", password: r.password, message: r.message ?? "" };
  },

  async crmClientRemind({ req, input }) {
    await apiStaff(req, "clients.edit");
    const r = await remindClientAction(input.clientId);
    if (!r.ok) return refused(r.message);
    return { ok: true as const, message: r.message };
  },

  async crmClientForm({ req, input }) {
    const staff = await apiStaff(req, "clients.view");
    const c = container();
    const client = await c.reporting.clientById(input.clientId);
    if (!client || client.role !== "user" || !staff.context.canSee(client.managerId)) throw new HttpError(404, "notFound");
    const [defs, noMarketing, admins] = await Promise.all([
      listFields("client"),
      c.messaging.chats.noMarketingFor({ clientId: client.id, phones: [client.phone, ...client.extraPhones] }),
      c.access.queries.allStaff(),
    ]);
    const seesContacts = can(staff, "clients.contacts");
    const options = staffOptions(admins);
    const channel = channelOf(toAttribution(client.source));
    return {
      id: client.id,
      name: client.name || client.email.split("@")[0],
      phone: seesContacts ? (client.phone ?? "") : null,
      extraPhones: seesContacts ? client.extraPhones : [],
      canEditPhones: can(staff, "clients.edit", "clients.contacts"),
      tags: client.tags,
      fields: fieldsOut(defs, client.customFields),
      noMarketing: !!noMarketing,
      locale: client.locale,
      locales: LOCALES,
      channel: isManualChannel(channel) ? channel : null,
      channels: manualChannels.map((id) => ({ id, label: channels[id] })),
      managerId: client.managerId,
      // «Только свои» может взять неразобранного себе, но не отдать другому — как на сайте.
      managers: canAssignOthers(staff) ? options : options.filter((a) => a.id === staff.user.id || a.id === client.managerId),
      canEdit: can(staff, "clients.edit"),
    };
  },

  async crmClientUpdate({ req, input }) {
    await apiStaff(req, "clients.edit");
    const id = input.clientId;
    const b = input.body;
    let message: string | null = null;
    // По одному действию на поле, как кнопки карточки: первое отказавшее — ответом, остальное не трогаем.
    const step = async (r: { ok: boolean; message?: string }) => {
      if (!r.ok) throw new Refusal(r.message ?? "Не удалось сохранить");
      message = r.message ?? message;
    };
    try {
      if (b.extraPhones !== undefined) await step(await setClientPhonesAction(id, b.extraPhones.join("\n")));
      if (b.tags !== undefined) {
        await updateClientTagsAction(id, b.tags);
        message = "Теги сохранены";
      }
      if (b.fields) {
        const form = new FormData();
        form.set("clientId", id);
        fieldsToForm(form, await listFields("client"), b.fields);
        const r = await setClientFieldsAction({}, form);
        await step(r.error ? { ok: false, message: r.error } : { ok: true, message: r.ok });
      }
      if (b.noMarketing !== undefined) await step(await setClientNoMarketingAction(id, b.noMarketing));
      if (b.locale !== undefined) await step(await setClientLocaleAction(id, b.locale));
      if (b.channel !== undefined) await step(await setClientChannelAction(id, b.channel));
      if (b.managerId !== undefined) await step(await setClientManagerAction(id, b.managerId));
    } catch (err) {
      if (err instanceof Refusal) return refused(err.message);
      throw err;
    }
    return { ok: true, message: message ?? "Сохранено" };
  },
};

class Refusal extends Error {}
