/**
 * Обновление фото профиля клиентов WhatsApp (планировщик и новые чаты): по очереди спрашиваем у шлюза фото тех, кого
 * ещё не проверяли или проверяли давно, и храним свою копию. Шлюз — это телефон магазина, поэтому без спешки: пауза
 * между запросами, ограниченная порция за проход.
 */

/** Как часто перепроверять фото одного клиента (сменил ли он его). */
export const AVATAR_RECHECK_MS = 7 * 86_400_000;
/** Пауза между запросами к шлюзу. */
export const AVATAR_PAUSE_MS = 400;

export interface AvatarDeps {
  /** Чаты WhatsApp, чьё фото ещё не проверяли или проверяли раньше checkedBefore: сначала непроверенные, потом свежие. */
  due(limit: number, checkedBefore: Date): Promise<{ id: string; chatId: string; avatarUrl: string | null }[]>;
  /** Фото у WhatsApp: id и временный адрес; null — фото нет или скрыто. */
  avatar(chatId: string): Promise<{ id: string; url: string } | null>;
  /** Скачать и сохранить фото; возвращает нашу ссылку. */
  store(conversationId: string, avatarId: string, url: string): Promise<string>;
  /** avatarUrl: undefined — ссылку не менять (то же фото или ошибка), только отметить проверку. */
  save(conversationId: string, avatarUrl: string | null | undefined, at: Date): Promise<void>;
  sleep(ms: number): Promise<void>;
  now(): Date;
  logger: { error(msg: string, err: unknown): void };
}

/** Id фото в нашей ссылке (…_<id>_<подпись>.webp): то же фото повторно не качаем. */
export const avatarIdOf = (url: string | null) => (url ? (/_(\d{1,30})_[\w-]{22}\.webp$/.exec(url)?.[1] ?? null) : null);

/**
 * Один проход: до limit чатов. Возвращает, сколько фото появилось или сменилось. Ошибка шлюза (не на связи, лимит) —
 * проход останавливается, чаты остаются в очереди; ошибка скачивания одного фото — чат отмечен, следующий.
 */
export async function refreshChatAvatars(d: AvatarDeps, limit: number): Promise<number> {
  const rows = await d.due(limit, new Date(d.now().getTime() - AVATAR_RECHECK_MS));
  let changed = 0;
  for (const [i, row] of rows.entries()) {
    if (i) await d.sleep(AVATAR_PAUSE_MS);
    let pic: { id: string; url: string } | null;
    try {
      pic = await d.avatar(row.chatId);
    } catch (err) {
      d.logger.error("gateway", err);
      break;
    }
    try {
      if (!pic) {
        // Фото убрали или скрыли — показываем букву.
        await d.save(row.id, null, d.now());
        if (row.avatarUrl) changed++;
      } else if (avatarIdOf(row.avatarUrl) === pic.id) {
        await d.save(row.id, undefined, d.now());
      } else {
        await d.save(row.id, await d.store(row.id, pic.id, pic.url), d.now());
        changed++;
      }
    } catch (err) {
      d.logger.error(`conversation ${row.id}`, err);
      await d.save(row.id, undefined, d.now()).catch(() => undefined);
    }
  }
  return changed;
}
