import type { Clock, SettingsStore, StaffNotification, StaffNotifier } from "@/shared/application";
import { storeTimeZone, zonedDay } from "@/shared/domain/time";
import { OrderingError, kaspiWatchFromJson, kaspiWatchStep, kaspiWatchToJson, sameKaspiWatch, type KaspiDownReason, type KaspiProbe, type KaspiWatchSignal, type KaspiWatchState } from "../domain";
import type { KaspiAuthGateway, KaspiConfigStore } from "./ports";

/** Настройки слежки за кассиром: состояние между проверками (JSON) и порог тревоги в минутах («Интеграции» → «Оплата»). */
export type KaspiWatchSettingKey = "kaspi.watch" | "kaspi.alertAfterMinutes";

/** Не чаще раза в столько спрашиваем Kaspi о сессии кассира: проход планировщика идёт каждую минуту. */
export const KASPI_WATCH_EVERY_MS = 3 * 60_000;
/** Порог тревоги по умолчанию и допустимые значения, минут: столько кассир не работает подряд — сообщаем руководителям. */
export const KASPI_ALERT_AFTER_DEFAULT = 5;
export const KASPI_ALERT_AFTER_MAX = 240;
/** Кому сообщать: руководителям и тем, кто может переподключить кассира. */
const WHO = "settings.manage";

const SETTINGS_LINK = "/admin/settings?tab=payments";

const why: Record<KaspiDownReason, string> = {
  rejected: "Kaspi не принимает сессию кассира — скорее всего, в кассира вошли с другого устройства.",
  unreachable: "Сервис kaspi-pos не отвечает.",
  no_session: "Нет сессии кассира.",
};

/** Что сделать руководителю: общую сессию обновляют на сервере, свою — входом по SMS в «Интеграциях». */
function fix(reason: KaspiDownReason, shared: boolean) {
  if (reason === "unreachable") return "Проверьте, что kaspi-pos запущен на сервере.";
  if (shared) return "Сессия общая с другим проектом: войдите заново там и обновите KASPI_TOKEN_SN, KASPI_VTOKEN_SECRET и KASPI_PROFILE_ID на сервере.";
  return "Подключите кассира заново в «Интеграциях» → «Оплата».";
}

/** «14:05» сегодня, иначе «18 октября, 14:05» — по часам магазина. */
function at(d: Date, now: Date) {
  const tz = storeTimeZone();
  const time = new Intl.DateTimeFormat("ru-RU", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(d);
  return zonedDay(d, tz) === zonedDay(now, tz) ? time : `${new Intl.DateTimeFormat("ru-RU", { timeZone: tz, day: "numeric", month: "long" }).format(d)}, ${time}`;
}

/** «7 мин», «2 ч 5 мин». */
function lasted(ms: number) {
  const min = Math.max(1, Math.round(ms / 60_000));
  return min < 60 ? `${min} мин` : `${Math.floor(min / 60)} ч${min % 60 ? ` ${min % 60} мин` : ""}`;
}

/**
 * Сигнал «кассир Kaspi отключён»: проход планировщика спрашивает kaspi-pos, принимает ли Kaspi сессию кассира, и сообщает
 * руководителям (CRM и push) только о смене состояния — отключён дольше порога и снова подключён. Менеджеры видят плашку
 * в окне счёта и над полем ввода чата. Дубль руководителю в WhatsApp — после того, как напоминание сотруднику в WhatsApp
 * перестанет заводить заявку (план P0-5).
 */
export class KaspiWatchService {
  /** Когда этот процесс последний раз спрашивал Kaspi; после перезапуска проверка — в первом же проходе. */
  private lastProbeAt = 0;

  constructor(
    private readonly config: Pick<KaspiConfigStore, "config">,
    private readonly auth: Pick<KaspiAuthGateway, "sessionActive">,
    private readonly settings: SettingsStore<KaspiWatchSettingKey>,
    private readonly notifier: StaffNotifier<typeof WHO>,
    private readonly clock: Clock,
    private readonly everyMs = KASPI_WATCH_EVERY_MS,
  ) {}

  /**
   * Проход планировщика (каждую минуту, запрос к Kaspi — не чаще раза в everyMs). Оплата через Kaspi выключена — следить
   * не за чем: прежняя тревога снимается молча. Возвращает сигнал, если о смене состояния сообщили.
   */
  async check(): Promise<KaspiWatchSignal | null> {
    const { enabled, session, shared } = await this.config.config();
    const prev = await this.load();
    if (!enabled) {
      if (prev) await this.settings.save({ "kaspi.watch": "" }, null);
      return null;
    }
    const now = this.clock.now();
    if (now.getTime() - this.lastProbeAt < this.everyMs) return null;
    this.lastProbeAt = now.getTime();
    const probe: KaspiProbe = session ? await this.probe() : { ok: false, reason: "no_session" };
    const { next, signal } = kaspiWatchStep(prev, probe, now, (await this.alertAfterMinutes()) * 60_000);
    // Сначала уведомление, потом состояние: не дошло уведомление — тревога повторится в следующей проверке, а не потеряется.
    if (signal) await this.notifier.notifyAllWith(WHO, signal === "down" ? this.down(next, shared) : this.up(prev!, now));
    if (!prev || !sameKaspiWatch(prev, next)) await this.settings.save({ "kaspi.watch": kaspiWatchToJson(next) }, null);
    return signal;
  }

  /**
   * Плашка для менеджера (окно счёта, поле ввода чата): кассир отключён и руководителям уже сообщили; иначе null.
   * Без запроса к Kaspi — только сохранённое состояние, поэтому годится для каждой отрисовки страницы.
   */
  async warning(): Promise<string | null> {
    if (!(await this.config.config()).enabled) return null;
    const state = await this.load();
    if (!state || state.ok || !state.alerted) return null;
    return `Кассир Kaspi отключён с ${at(state.since, this.clock.now())} — оплаты Kaspi не подтверждаются сами, счёт Kaspi на номер клиента не выставится. Руководителям сообщили; оплату через Kaspi пока проверяйте вручную.`;
  }

  /** Порог тревоги, минут: не задан или испорчен — по умолчанию. */
  async alertAfterMinutes(): Promise<number> {
    const raw = (await this.settings.get("kaspi.alertAfterMinutes")).trim();
    const n = Number(raw);
    return raw && Number.isInteger(n) && n >= 0 && n <= KASPI_ALERT_AFTER_MAX ? n : KASPI_ALERT_AFTER_DEFAULT;
  }

  async setAlertAfterMinutes(minutes: number, actorId: string) {
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > KASPI_ALERT_AFTER_MAX) throw new RangeError("kaspi alert threshold");
    await this.settings.save({ "kaspi.alertAfterMinutes": String(minutes) }, actorId);
  }

  // ─── внутреннее ──────────────────────────────────────────────────────────

  private async load(): Promise<KaspiWatchState | null> {
    return kaspiWatchFromJson(await this.settings.get("kaspi.watch"));
  }

  /** Принимает ли Kaspi сессию: 401 от kaspi-pos — нет; сеть, таймаут, 5xx — сервис не отвечает. */
  private async probe(): Promise<KaspiProbe> {
    try {
      return (await this.auth.sessionActive()) ? { ok: true } : { ok: false, reason: "rejected" };
    } catch (err) {
      return { ok: false, reason: OrderingError.is(err) && err.code === "kaspiNotConnected" ? "rejected" : "unreachable" };
    }
  }

  private down(state: KaspiWatchState, shared: boolean): StaffNotification {
    const reason = state.reason ?? "unreachable";
    return { kind: "system", title: "Кассир Kaspi отключён", body: `${why[reason]} Пока так, оплаты Kaspi не подтверждаются сами, а счёт Kaspi на номер клиента не выставляется. ${fix(reason, shared)}`, link: SETTINGS_LINK };
  }

  private up(prev: KaspiWatchState, now: Date): StaffNotification {
    return {
      kind: "system",
      title: "Кассир Kaspi снова подключён",
      body: `Оплаты Kaspi снова подтверждаются сами; пришедшие за время сбоя сверка проведёт в ближайшие минуты. Кассир не работал ${lasted(now.getTime() - prev.since.getTime())} (с ${at(prev.since, now)}).`,
      link: SETTINGS_LINK,
    };
  }
}
