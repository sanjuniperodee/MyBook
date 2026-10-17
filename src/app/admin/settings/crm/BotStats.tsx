import type { BotMetrics } from "@/modules/messaging";

const OUTCOMES: [string, string][] = [
  ["finished", "собрал ответы"],
  ["handoff", "передал человеку"],
  ["stopped_by_manager", "остановлен ответом менеджера"],
  ["abandoned", "клиент замолчал"],
  ["declined", "клиенту не интересно"],
];
const INTENTS: Record<string, string> = {
  price: "цена",
  how: "как это работает",
  timing: "сроки",
  delivery: "доставка",
  payment: "оплата",
  examples: "примеры",
  language: "язык книги",
  "handoff:call": "просили позвонить",
  "handoff:manager": "просили менеджера",
  "handoff:paid": "сообщили об оплате",
  "handoff:pay": "хотели оплатить",
  "handoff:complaint": "жалоба",
};

/** Метрики бота за 30 дней — по журналу событий: запуски и пропуски, итоги, воронка по вопросам, вопросы клиентов. */
export function BotStats({ m, questions, skipLabels }: { m: BotMetrics; questions: { key: string; label: string }[]; skipLabels: Record<string, string> }) {
  const skipped = Object.entries(m.skipped).sort((a, b) => b[1] - a[1]);
  const intents = Object.entries(m.intents).sort((a, b) => b[1] - a[1]);
  const langs = Object.entries(m.langs);
  return (
    <div className="rounded-xl border border-line p-3 text-sm" data-testid="bot-stats">
      <h3 className="mb-2 font-medium">За 30 дней</h3>
      {!m.started && !skipped.length ? <p className="text-xs text-muted">Бот ещё не работал.</p> : null}
      <div className="grid gap-3 text-xs sm:grid-cols-2">
        <div>
          <div className="mb-1 text-muted">Начал опрос: {m.started}</div>
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
      </div>
    </div>
  );
}
