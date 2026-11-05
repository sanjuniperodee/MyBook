import "server-only";

/**
 * Фоновая работа сайта: планировщик (сверка Kaspi, outbox, правила CRM, бот, IMAP, сверка GOWA, письма), сторож звонков
 * WhatsApp и очередь своих видео/аудио. Запускается либо в процессе сайта (как раньше), либо в отдельном процессе
 * mybook-worker (src/worker/main.ts) — тогда PM2 ставит сайту MYBOOK_BACKGROUND=worker, и сайт фон не запускает.
 * Все проходы и так рассчитаны на несколько процессов: advisory-блокировки, FOR UPDATE SKIP LOCKED, LISTEN/NOTIFY.
 */
export function backgroundInWorker(env: Record<string, string | undefined> = process.env): boolean {
  return env.MYBOOK_BACKGROUND === "worker";
}

export async function startBackground(opts: { answerFilesDelayMs?: number } = {}) {
  const { startScheduler } = await import("@/server/scheduler");
  startScheduler();
  const { startWhatsappCallWatcher } = await import("@/server/whatsapp-call-watcher");
  startWhatsappCallWatcher();
  // Свои видео и аудио, которые ждали обработки при перезапуске: по умолчанию через минуту, когда выкатка закончит проверки.
  const { kickAnswerFiles } = await import("@/server/answerFilesWorker");
  setTimeout(kickAnswerFiles, opts.answerFilesDelayMs ?? 60_000).unref();
}
