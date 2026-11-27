import type { Clock, Logger, SettingsReader, StaffNotifier } from "@/shared/application";
import { OPS_PAGE, OPS_TEXT, opsText } from "@/shared/domain/opsHealth";
import { alertSignals, alertStep, evaluate, type CashierState, type OpsSnapshot } from "../domain/health";
import type { OpsAlertStore, OpsFactsReader, OpsSettingKey, PulseStore } from "./ports";

/** Сводку держим столько миллисекунд: страницу открывают на нескольких вкладках с автообновлением. */
const CACHE_MS = 5_000;

/** Состояние кассира из настройки kaspi.watch (JSON KaspiWatchService); пусто или испорчено — null. */
export function cashierFromJson(raw: string): CashierState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const since = new Date(String(v.since));
    if (typeof v.ok !== "boolean" || Number.isNaN(since.getTime())) return null;
    return { ok: v.ok, since, reason: typeof v.reason === "string" ? v.reason : null, alerted: v.alerted === true };
  } catch {
    return null;
  }
}

/** Сводка «Фон и очереди»: пульсы заданий и агрегаты очередей → уровни, цифры и сигналы потоков. */
export class OpsHealthService {
  private cached: { at: number; snapshot: OpsSnapshot } | null = null;

  constructor(
    private readonly pulses: PulseStore,
    private readonly facts: OpsFactsReader,
    private readonly settings: SettingsReader<OpsSettingKey>,
    private readonly clock: Clock,
  ) {}

  async snapshot(): Promise<OpsSnapshot> {
    const now = this.clock.now();
    if (this.cached && now.getTime() - this.cached.at < CACHE_MS && now.getTime() >= this.cached.at) return this.cached.snapshot;
    const cfg = await this.settings.getMany(["crm.aiTranscribe", "notify.auto", "kaspi.watch"]);
    const [pulses, facts] = await Promise.all([this.pulses.all(), this.facts.facts(now, { voices: cfg["crm.aiTranscribe"] === "on" })]);
    const snapshot = evaluate({ ...facts, pulses, mail: { ...facts.mail, autoOn: cfg["notify.auto"] !== "off" }, cashier: cashierFromJson(cfg["kaspi.watch"]) }, now);
    this.cached = { at: now.getTime(), snapshot };
    return snapshot;
  }
}

/**
 * Оповещение руководителей (право settings.manage): поток в сбое дольше OPS_THRESHOLDS.alertAfterMin — уведомление в CRM,
 * повтор не чаще раза в alertEveryMin; поток вернулся в норму после уведомления — «снова в норме» без push. Идёт в
 * процессе API (mybook-backend), а не в воркере: иначе остановка воркера осталась бы без уведомления.
 */
export class OpsAlertsService {
  constructor(
    private readonly health: OpsHealthService,
    private readonly store: OpsAlertStore,
    private readonly notifier: StaffNotifier<"settings.manage">,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  /** Проход раз в минуту. Возвращает, о скольких потоках сообщили (сбой и восстановление). */
  async run(): Promise<number> {
    const now = this.clock.now();
    const [snapshot, prev] = await Promise.all([this.health.snapshot(), this.store.all()]);
    let sent = 0;
    for (const stream of snapshot.streams) {
      const reasons = alertSignals(stream);
      const before = prev.get(stream.key) ?? null;
      const { next, send } = alertStep(before, reasons.length > 0, now);
      if (send === "down") {
        await this.notifier.notifyAllWith("settings.manage", {
          kind: "system",
          title: opsText(OPS_TEXT.alertTitle, { text: stream.title }),
          body: opsText(OPS_TEXT.alertBody, { text: reasons.map((r) => r.text).join("; ") }),
          link: OPS_PAGE.href,
        });
        this.logger.warn(`stream ${stream.key} down`, { reasons: reasons.map((r) => r.text) });
        sent++;
      } else if (send === "up") {
        await this.notifier.notifyAllWith("settings.manage", { kind: "system", title: opsText(OPS_TEXT.recoveredTitle, { text: stream.title }), link: OPS_PAGE.href, push: false });
        sent++;
      }
      const same = before && before.downSince?.getTime() === next.downSince?.getTime() && before.notifiedAt?.getTime() === next.notifiedAt?.getTime();
      if (!same && (before || next.downSince)) await this.store.save(stream.key, next);
    }
    return sent;
  }
}
