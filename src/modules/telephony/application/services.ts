import type { Clock } from "@/shared/application";
import { formatPhone } from "@/lib/crm/phone";
import { Call, TelephonyError, type CallEvent } from "../domain";
import type { CallRepository, CallSideEffects, CallTimeline, SalesGateway, StaffDirectory, TelephonyProvider } from "./ports";

/** События АТС → журнал звонков, сделки, лента клиента, пропущенные. Идемпотентно. */
export class CallsService {
  constructor(
    private readonly calls: CallRepository,
    private readonly staff: StaffDirectory,
    private readonly sales: SalesGateway,
    private readonly timeline: CallTimeline,
    private readonly effects: CallSideEffects,
    private readonly clock: Clock,
  ) {}

  async handle(e: CallEvent) {
    const call = await this.apply(e);
    // Карточка входящего звонка должна появиться сразу, а не через интервал опроса.
    if (call) this.effects.callChanged();
    return call?.snapshot() ?? null;
  }

  private async apply(e: CallEvent): Promise<Call | null> {
    const staffId = await this.staff.byExtension(e.extension);
    let call = await this.calls.findByExternal(e.provider, e.externalId);
    if (!call) {
      if (e.stage === "record") return null; // запись без звонка — игнорируем
      const clientId = e.clientPhone ? await this.sales.findClientByPhone(e.clientPhone) : null;
      const dealId = e.clientPhone || clientId ? await this.sales.findOpenDealId({ clientId, phone: e.clientPhone }) : null;
      const fresh = Call.ring(this.calls.nextId(), e, { staffId, clientId, dealId });
      call = (await this.calls.add(fresh)) ? fresh : (await this.calls.findByExternal(e.provider, e.externalId))!;
    }
    switch (call.apply(e, staffId, this.clock.now())) {
      case "unchanged":
        return call;
      case "changed":
        await this.calls.save(call);
        return call;
      case "finish":
        if (!(await this.calls.finish(call))) return call; // уже обработан
        return this.afterCall(call);
    }
  }

  /** Итог звонка: сделка для нового номера, запись в ленту, пропущенный → уведомление и правила CRM. */
  private async afterCall(call: Call): Promise<Call> {
    // Номер в спаме: звонок в журнале остаётся, но без заявки, задач и уведомлений.
    if (call.clientPhone && (await this.effects.isBlocked(call.clientPhone))) return call;
    if (call.needsDeal) {
      const deal = await this.sales.createCallDeal({ title: `Звонок: ${formatPhone(call.clientPhone)}`, clientId: call.clientId, contactPhone: call.clientPhone, contactName: call.clientId ? "" : formatPhone(call.clientPhone) });
      call.linkDeal(deal.id, deal.clientId);
      await this.calls.save(call);
    }
    const staffName = call.staffId ? await this.staff.displayName(call.staffId) : null;
    if (call.clientId) await this.timeline.record({ clientId: call.clientId, dealId: call.dealId, authorId: call.staffId, text: call.summary(staffName) });
    if (call.status === "answered" && call.clientPhone) await this.calls.markMissedHandled(call.clientPhone, this.clock.now());
    if (call.isMissed) {
      const owner = call.dealId ? await this.sales.dealOwner(call.dealId) : null;
      await this.effects.notifyMissed(owner?.assigneeId ?? call.staffId, {
        title: `Пропущенный звонок: ${formatPhone(call.clientPhone) || "скрытый номер"}`,
        body: owner?.contactName ?? "",
        link: call.dealId ? `/admin/deals/${call.dealId}` : "/admin/calls",
      });
      await this.effects.missedRules({ subject: call.id, callId: call.id, dealId: call.dealId, clientId: call.clientId });
    }
    return call;
  }
}

/** Звонки из CRM: обратный звонок через АТС, веб-телефон в браузере, записи разговоров. */
export class TelephonyService {
  constructor(private readonly provider: TelephonyProvider) {}

  currentProvider() {
    return this.provider.provider();
  }

  /** АТС сначала звонит на внутренний номер сотрудника, затем соединяет с клиентом. */
  async clickToCall(extension: string | null, phone: string) {
    if ((await this.provider.provider()) !== "zadarma") throw new TelephonyError("notConfigured", "Звонок из CRM доступен с Zadarma. Для другой АТС используйте ссылку tel:");
    if (!extension) throw new TelephonyError("notConfigured", "У вас не указан внутренний номер — его задаёт руководитель в разделе «Команда»");
    await this.provider.callback(extension, phone);
  }

  /** Веб-телефон доступен: Zadarma, включён в «Интеграциях», задан номер АТС и внутренний номер сотрудника. */
  async webphoneAvailable(extension: string | null) {
    if (!extension) return false;
    const [provider, s] = await Promise.all([this.provider.provider(), this.provider.webphoneSettings()]);
    return provider === "zadarma" && s.enabled && !!s.pbxId;
  }

  /** Ключ для WebRTC-виджета Zadarma (живёт 72 часа) и SIP-логин сотрудника. */
  async webphoneKey(extension: string | null): Promise<{ key: string; sip: string }> {
    if (!(await this.webphoneAvailable(extension))) throw new TelephonyError("notConfigured", "Веб-телефон не настроен: нужен номер АТС в «Интеграциях» и внутренний номер сотрудника в «Команде»");
    const { pbxId } = await this.provider.webphoneSettings();
    const sip = `${pbxId.replace(/\D/g, "")}-${extension!.replace(/\D/g, "")}`;
    const key = await this.provider.webrtcKey(sip);
    if (!key) throw new TelephonyError("provider", "Zadarma не выдала ключ веб-телефона");
    return { key, sip };
  }

  /** Временная ссылка на запись: у Zadarma запрашиваем по требованию, у своей АТС — ссылка из вебхука. */
  async recordingUrl(call: { provider: string; externalId: string; hasRecording: boolean; recordingRef: string | null }) {
    if (!call.hasRecording) return null;
    if (call.provider === "zadarma") return this.provider.recordingLink(call);
    return call.recordingRef && /^https?:\/\//.test(call.recordingRef) ? call.recordingRef : null;
  }
}
