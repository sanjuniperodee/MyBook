import { kaspiPhone, OrderingError } from "../domain";
import type { KaspiAuthGateway, KaspiConfigStore } from "./ports";

/** Подключение кассира Kaspi Pay в «Интеграциях»: вход по SMS-коду, включение оплаты, состояние сессии. */
export class KaspiSetupService {
  constructor(
    private readonly auth: KaspiAuthGateway,
    private readonly store: KaspiConfigStore,
  ) {}

  /** Отправить SMS-код на номер кассира. При общей сессии — нельзя: вход вытеснил бы кассира у другого проекта. */
  async requestCode(phone: string) {
    if ((await this.store.config()).shared) throw new OrderingError("kaspiSessionShared");
    const normalized = kaspiPhone(phone);
    if (!normalized) throw new OrderingError("phoneInvalid");
    return this.auth.start(normalized);
  }

  /** Код из SMS → сессия кассира сохраняется, оплата через Kaspi включается. */
  async confirmCode(processId: string, otp: string, actorId: string) {
    if ((await this.store.config()).shared) throw new OrderingError("kaspiSessionShared");
    const session = await this.auth.verify(processId, otp.trim());
    await this.store.saveSession(session, actorId);
    await this.store.setEnabled(true, actorId);
    return { orgName: session.orgName, phone: session.phone };
  }

  async setEnabled(enabled: boolean, actorId: string) {
    const { session } = await this.store.config();
    if (enabled && !session) throw new OrderingError("kaspiNotConnected");
    await this.store.setEnabled(enabled, actorId);
  }

  /** Новый адрес сервиса kaspi-pos; отвечает ли он по этому адресу. */
  async setApiUrl(apiUrl: string, actorId: string) {
    await this.store.saveApiUrl(apiUrl.trim().replace(/\/+$/, ""), actorId);
    return this.auth.reachable();
  }

  /** Забыть сессию кассира (у Kaspi она не закрывается). Общую сессию с сервера не забыть — только выключить оплату. */
  async disconnect(actorId: string) {
    await this.store.setEnabled(false, actorId);
    if ((await this.store.config()).shared) return;
    await this.store.saveSession(null, actorId);
  }

  /** Для карточки в «Интеграциях»: отвечает ли сервис, подключён ли кассир и жива ли его сессия. */
  async status() {
    const { enabled, apiUrl, session, shared } = await this.store.config();
    const reachable = await this.auth.reachable();
    const active = reachable && session ? await this.auth.sessionActive().catch(() => false) : false;
    return { enabled, apiUrl, reachable, connected: !!session, active, shared, orgName: session?.orgName ?? "", phone: session?.phone ?? "" };
  }
}
