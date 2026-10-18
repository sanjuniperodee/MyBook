/**
 * База знаний владельца («Интеграции» → AI-помощник) в инструкции продажника. Помещается целиком — уходит как есть и
 * попадает в стабильную (кэшируемую) часть инструкции. Длиннее лимита — в инструкцию идут куски по теме разговора:
 * текст делится по пустым строкам и заголовкам, куски оцениваются по совпадению слов с последними сообщениями клиента
 * и берутся в исходном порядке, пока помещаются. Чистые функции.
 */

/** Сколько знаков базы знаний видит модель за ход (как у помощника менеджера). */
export const KNOWLEDGE_LIMIT = 5000;

/** Куски: абзацы через пустую строку; заголовок (#, ЗАГЛАВНЫМИ, «Вопрос:») начинает новый кусок. */
export function splitKnowledge(text: string): string[] {
  const out: string[] = [];
  for (const para of text.replace(/\r/g, "").split(/\n\s*\n/)) {
    let current: string[] = [];
    for (const line of para.split("\n")) {
      const heading = /^\s*(?:#{1,6}\s|[-•*]?\s*(?:[Вв]опрос|[Сс]ұрақ|[Qq])\s*[:.]|[A-ZА-ЯЁӘІҢҒҮҰҚӨҺ][A-ZА-ЯЁӘІҢҒҮҰҚӨҺ\s\d,.!?-]{6,}$)/u.test(line);
      if (heading && current.join("\n").trim()) {
        out.push(current.join("\n").trim());
        current = [];
      }
      current.push(line);
    }
    if (current.join("\n").trim()) out.push(current.join("\n").trim());
  }
  return out;
}

/** Основы слов (первые 5 букв слов от 4 букв) — грубая лемматизация для русского и казахского. */
export function stems(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) if (w.length >= 4) out.add(w.slice(0, 5));
  return out;
}

function overlap(chunk: string, query: Set<string>): number {
  let n = 0;
  for (const s of stems(chunk)) if (query.has(s)) n++;
  return n;
}

/**
 * Что из базы знаний показать модели. filtered — база длиннее лимита и выбраны куски по теме (эта часть инструкции
 * меняется от хода к ходу); иначе текст целиком.
 */
export function selectKnowledge(knowledge: string, query: string, limit = KNOWLEDGE_LIMIT): { text: string; filtered: boolean } {
  const text = knowledge.trim();
  if (text.length <= limit) return { text, filtered: false };
  const chunks = splitKnowledge(text);
  const q = stems(query);
  const scored = chunks.map((c, i) => ({ c, i, score: overlap(c, q) }));
  const picked = new Set<number>();
  let size = 0;
  // Сначала самые подходящие по теме, при равенстве — верхние (общие правила обычно в начале); что не влезло — пропускается.
  for (const x of [...scored].sort((a, b) => b.score - a.score || a.i - b.i)) {
    if (size + x.c.length + 2 > limit) continue;
    picked.add(x.i);
    size += x.c.length + 2;
  }
  if (!picked.size) return { text: text.slice(0, limit), filtered: true };
  return { text: scored.filter((x) => picked.has(x.i)).map((x) => x.c).join("\n\n"), filtered: true };
}
