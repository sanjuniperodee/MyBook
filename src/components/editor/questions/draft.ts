import type { EditorQuestion } from "@/lib/book/editor-model";

/** Несохранённая правка вопроса: ответ, свой заголовок, скрытый заголовок. */
export type Patch = Partial<Pick<EditorQuestion, "answer" | "displayText" | "hideHeading">>;

/** Очередь несохранённых правок по вопросам: правки одного вопроса сливаются, свежие поверх старых. */
export class DraftQueue {
  private readonly patches = new Map<string, Patch>();

  set(id: string, patch: Patch) {
    this.patches.set(id, { ...this.patches.get(id), ...patch });
  }

  delete(id: string) {
    this.patches.delete(id);
  }

  /** Забрать всё накопленное для отправки. */
  take(): [string, Patch][] {
    const batch = [...this.patches.entries()];
    this.patches.clear();
    return batch;
  }

  /** Вернуть неотправленную правку: то, что успели изменить после take(), остаётся поверх. */
  restore(id: string, patch: Patch) {
    this.patches.set(id, { ...patch, ...this.patches.get(id) });
  }

  get size() {
    return this.patches.size;
  }
}

/**
 * Отправить накопленные правки по одной (PATCH на вопрос). На первой ошибке отправка прерывается:
 * упавшая правка и все неотправленные после неё возвращаются в очередь, ошибка уходит наверх
 * (автосохранение повторит попытку).
 */
export async function sendDraft(queue: DraftQueue, send: (id: string, patch: Patch) => Promise<unknown>) {
  const batch = queue.take();
  for (let i = 0; i < batch.length; i++) {
    const [id, patch] = batch[i];
    try {
      await send(id, patch);
    } catch (e) {
      for (const [rid, rpatch] of batch.slice(i)) queue.restore(rid, rpatch);
      throw e;
    }
  }
}

/** Дописать распознанную фразу к ответу: через пробел, первая фраза пустого ответа — с заглавной. */
export function appendPhrase(answer: string, text: string) {
  const sep = !answer || /\s$/.test(answer) ? "" : " ";
  const chunk = answer.trim() ? text : text.charAt(0).toUpperCase() + text.slice(1);
  return answer + sep + chunk;
}
