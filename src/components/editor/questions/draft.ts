import type { EditorQuestion } from "@/lib/book/editor-model";

/**
 * Несохранённая правка вопроса: ответ, QR-коды видео и музыки, свой заголовок, скрытый заголовок; у раздела своей книги — ещё заголовок в книге
 * (title) и подсказка для себя (prompt).
 */
export type Patch = Partial<Pick<EditorQuestion, "answer" | "media" | "displayText" | "hideHeading" | "prompt">> & { title?: string };

/** Несохранённая правка главы своей книги. */
export type ChapterPatch = { title?: string; epigraph?: string };

/** Правка, как она ложится в раздел в редакторе: заголовок в книге хранится как defaultTitle. */
export function localPatch(patch: Patch): Partial<EditorQuestion> {
  const { title, ...rest } = patch;
  return title === undefined ? rest : { ...rest, defaultTitle: title };
}

/** Очередь несохранённых правок по ключу (вопрос или глава): правки одного ключа сливаются, свежие поверх старых. */
export class DraftQueue<P extends object = Patch> {
  private readonly patches = new Map<string, P>();

  set(id: string, patch: P) {
    this.patches.set(id, { ...this.patches.get(id), ...patch });
  }

  delete(id: string) {
    this.patches.delete(id);
  }

  /** Забрать всё накопленное для отправки. */
  take(): [string, P][] {
    const batch = [...this.patches.entries()];
    this.patches.clear();
    return batch;
  }

  /** Вернуть неотправленную правку: то, что успели изменить после take(), остаётся поверх. */
  restore(id: string, patch: P) {
    this.patches.set(id, { ...patch, ...this.patches.get(id) });
  }

  get size() {
    return this.patches.size;
  }
}

/** Раздела или главы уже нет (удалены в другой вкладке или на телефоне): повторять такую правку бесполезно. */
export function isGone(e: unknown): boolean {
  const code = typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined;
  return code === "questionNotFound" || code === "chapterNotFound";
}

/**
 * Отправить накопленные правки по одной. Если раздела или главы уже нет (404 questionNotFound/chapterNotFound),
 * правка выбрасывается окончательно, остальные уходят дальше, а её id попадает в gone. На любой другой ошибке отправка
 * прерывается: упавшая правка и все неотправленные после неё возвращаются в очередь, ошибка уходит наверх
 * (автосохранение повторит попытку).
 */
export async function sendDraft<P extends object = Patch>(queue: DraftQueue<P>, send: (id: string, patch: P) => Promise<unknown>, gone?: string[]) {
  const batch = queue.take();
  for (let i = 0; i < batch.length; i++) {
    const [id, patch] = batch[i];
    try {
      await send(id, patch);
    } catch (e) {
      if (isGone(e)) {
        gone?.push(id);
        continue;
      }
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
