import type { BotMetrics } from "@/modules/messaging";
import { byLabel, failureReasonLabels, handoffReasonLabels } from "@/modules/messaging/domain/botStats";

const OUTCOMES: [string, string][] = [
  ["takeover", "подхватил начатую переписку"],
  ["finished", "собрал ответы"],
  ["handoff", "передал человеку"],
  ["stopped_by_manager", "остановлен ответом менеджера"],
  ["abandoned", "клиент замолчал"],
  ["declined", "клиенту не интересно"],
  ["offer", "сделал предложение"],
  ["agreed", "клиент согласился"],
  ["invoiced", "выставил счёт"],
  ["offered", "предложение без ответа"],
];
const INTENTS: Record<string, string> = {
  price: "цена",
  how: "как это работает",
  timing: "сроки",
  delivery: "доставка",
  payment: "оплата",
  examples: "примеры",
  language: "язык книги",
};

const TIERS: [string, string][] = [
  ["haiku", "Haiku"],
  ["sonnet", "Sonnet"],
  ["opus", "Opus"],
  ["fallback", "запасная модель"],
];
const pct = (n: number, of: number) => `${Math.round((n / of) * 100)}%`;
const usd = (n: number) => `$${n < 1 ? n.toFixed(4) : n.toFixed(2)}`;

/** Модель продажника: доли уровней (ответили / выбрал код), эскалации, расходы на 1 000 ходов, кэш, сбои и запасные. */
function LlmStats({ llm }: { llm: NonNullable<BotMetrics["llm"]> }) {
  const share = (rec: Record<string, number>) =>
    TIERS.filter(([k]) => rec[k])
      .map(([k, label]) => `${label} ${pct(rec[k], llm.turns)}`)
      .join(" · ");
  return (
    <div data-testid="bot-llm">
      <div className="mb-1 text-muted">Модель продажника</div>
      <div>{`Ходов: ${llm.turns}, ответили: ${share(llm.answered)}`}</div>
      {Object.keys(llm.chosen).length ? <div className="text-muted">{`Выбрал маршрут: ${share(llm.chosen)}`}</div> : null}
      <div>{`Эскалаций: ${llm.escalations}; расходы: ${usd(llm.costUsd)}${llm.costPer1000 !== null ? `, на 1 000 ходов — ${usd(llm.costPer1000)}` : ""}`}</div>
      <div className="text-muted">{`Токены: вход ${llm.tokens.input}, из кэша ${llm.tokens.cacheRead}, в кэш ${llm.tokens.cacheWrite}, выход ${llm.tokens.output}`}</div>
      {llm.failed || llm.fallback || llm.retries ? <div className="text-amber-800">{`Сбои запросов: ${llm.failed}, повторы: ${llm.retries}, ответила запасная: ${llm.fallback}`}</div> : null}
    </div>
  );
}

/**
 * Метрики бота за 30 дней — по журналу событий: запуски и пропуски, итоги, воронка по вопросам, вопросы клиентов,
 * почему беседа ушла менеджеру и — отдельно — сбои самого бота (модель не ответила, петля, потолок беседы).
 */
export function BotStats({ m, questions, skipLabels }: { m: BotMetrics; questions: { key: string; label: string }[]; skipLabels: Record<string, string> }) {
  const skipped = Object.entries(m.skipped).sort((a, b) => b[1] - a[1]);
  const intents = Object.entries(m.intents).sort((a, b) => b[1] - a[1]);
  const handoffs = byLabel(m.handoffs, handoffReasonLabels);
  const failures = byLabel(m.failures, failureReasonLabels);
  const langs = Object.entries(m.langs);
  return (
    <div className="rounded-xl border border-line p-3 text-sm" data-testid="bot-stats">
      <h3 className="mb-2 font-medium">За 30 дней</h3>
      {!m.started && !skipped.length ? <p className="text-xs text-muted">Бот ещё не работал.</p> : null}
      <div className="grid gap-3 text-xs sm:grid-cols-2">
        <div>
          <div className="mb-1 text-muted">Начал беседу: {m.started}</div>
          {OUTCOMES.map(([k, label]) => (m.outcomes[k] ? <div key={k}>{`${label}: ${m.outcomes[k]}`}</div> : null))}
          {langs.length ? <div className="mt-1 text-muted">Языки: {langs.map(([l, n]) => `${l === "kk" ? "казахский" : "русский"} ${n}`).join(", ")}</div> : null}
          {m.replyMinutes !== null ? <div className="mt-1 text-muted">Менеджер ответил после бота за ~{m.replyMinutes} мин (медиана)</div> : null}
          {m.started ? <div className="text-muted">Дошли до договорённости или оплаты: {m.converted}</div> : null}
        </div>
        <div>
          {questions.length && m.started ? (
            <>
              <div className="mb-1 text-muted">Ответили на вопрос (не распознано)</div>
              {questions.map((q) => (
                <div key={q.key}>{`${q.label}: ${m.answered[q.key] ?? 0}${m.unrecognized[q.key] ? ` (${m.unrecognized[q.key]})` : ""}`}</div>
              ))}
            </>
          ) : null}
        </div>
        {skipped.length ? (
          <div>
            <div className="mb-1 text-muted">Не начинал</div>
            {skipped.map(([reason, n]) => (
              <div key={reason}>{`${skipLabels[reason] ?? reason}: ${n}`}</div>
            ))}
          </div>
        ) : null}
        {intents.length ? (
          <div>
            <div className="mb-1 text-muted">О чём спрашивали</div>
            {intents.map(([k, n]) => (
              <div key={k}>{`${INTENTS[k] ?? k}: ${n}`}</div>
            ))}
          </div>
        ) : null}
        {handoffs.length ? (
          <div>
            <div className="mb-1 text-muted">Почему передал менеджеру</div>
            {handoffs.map(([label, n]) => (
              <div key={label}>{`${label}: ${n}`}</div>
            ))}
          </div>
        ) : null}
        {m.llm?.turns ? <LlmStats llm={m.llm} /> : null}
        {failures.length ? (
          <div data-testid="bot-failures">
            <div className="mb-1 text-red-700">Сбои</div>
            {failures.map(([label, n]) => (
              <div key={label}>{`${label}: ${n}`}</div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
