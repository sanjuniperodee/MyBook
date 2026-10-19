/**
 * Слежка за кассиром Kaspi. Проход планировщика проверяет сессию кассира, а руководителям сообщается только о смене
 * состояния: «отключён» (после порога подряд неудачных проверок — короткий перезапуск kaspi-pos тревоги не даёт) и
 * «снова подключён». Пока кассир не работает, оплаты Kaspi не подтверждаются сами, а счёт Kaspi на номер не выставляется.
 * Кассир общий с другим проектом, поэтому второй вход по SMS там вытесняет сессию здесь — и раньше об этом никто не знал.
 */

/** Почему кассир не работает: сессии нет; сервис kaspi-pos не отвечает; Kaspi не принимает сессию (вход с другого устройства). */
export type KaspiDownReason = "no_session" | "unreachable" | "rejected";

/** Итог одной проверки кассира. */
export type KaspiProbe = { ok: true } | { ok: false; reason: KaspiDownReason };

/** Что помним о кассире между проверками и после перезапуска. */
export interface KaspiWatchState {
  /** Итог последней проверки. */
  ok: boolean;
  /** С какого момента держится этот итог: первая из неудачных проверок подряд или восстановление. */
  since: Date;
  /** Причина последней неудачной проверки; null — кассир работает. */
  reason: KaspiDownReason | null;
  /** Руководителям сообщили, что кассир отключён: видны плашки, при восстановлении придёт «снова подключён». */
  alerted: boolean;
}

/** О чём сообщить руководителям после проверки. */
export type KaspiWatchSignal = "down" | "up";

/**
 * Следующее состояние после проверки и сигнал, если оно сменилось. «Отключён» — один раз, когда неудачные проверки
 * подряд длятся не меньше alertAfterMs (0 — сразу); дальше, сколько бы проверок ни прошло, — тишина. «Снова подключён» —
 * только после такой тревоги: сбой короче порога руководителей не беспокоит.
 */
export function kaspiWatchStep(prev: KaspiWatchState | null, probe: KaspiProbe, now: Date, alertAfterMs: number): { next: KaspiWatchState; signal: KaspiWatchSignal | null } {
  if (probe.ok) return { next: { ok: true, since: prev?.ok ? prev.since : now, reason: null, alerted: false }, signal: prev && !prev.ok && prev.alerted ? "up" : null };
  const since = prev && !prev.ok ? prev.since : now;
  const already = !!prev && !prev.ok && prev.alerted;
  const due = !already && now.getTime() - since.getTime() >= Math.max(0, alertAfterMs);
  return { next: { ok: false, since, reason: probe.reason, alerted: already || due }, signal: due ? "down" : null };
}

/** Состояние не изменилось — сохранять незачем (проверка раз в несколько минут не пишет в базу, пока всё по-прежнему). */
export const sameKaspiWatch = (a: KaspiWatchState, b: KaspiWatchState) => a.ok === b.ok && a.since.getTime() === b.since.getTime() && a.reason === b.reason && a.alerted === b.alerted;

const REASONS: readonly KaspiDownReason[] = ["no_session", "unreachable", "rejected"];

/** Состояние для хранения в настройках (JSON). */
export const kaspiWatchToJson = (s: KaspiWatchState) => JSON.stringify({ ok: s.ok, since: s.since.toISOString(), reason: s.reason, alerted: s.alerted });

/** Состояние из настроек; пусто или испорчено — как будто проверок ещё не было. */
export function kaspiWatchFromJson(raw: string | null | undefined): KaspiWatchState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const since = new Date(String(v.since));
    if (typeof v.ok !== "boolean" || Number.isNaN(since.getTime())) return null;
    const reason = REASONS.find((r) => r === v.reason) ?? null;
    return { ok: v.ok, since, reason: v.ok ? null : (reason ?? "unreachable"), alerted: !v.ok && v.alerted === true };
  } catch {
    return null;
  }
}
