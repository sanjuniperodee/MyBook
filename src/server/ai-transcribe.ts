import "server-only";
import { container } from "@/server/container";
import { getSetting } from "@/modules/workspace";
import { AI_TRANSCRIBE, aiFlagOn } from "@/shared/domain/aiCrm";

/**
 * «ИИ в CRM» → «Расшифровывает все голосовые» (crm.aiTranscribe): раз в минуту до AI_TRANSCRIBE.batch нерасшифрованных
 * голосовых за последние дни — моделью «Голосовые и фото» (у Groq — Whisper large-v3-turbo). Текст ложится в сообщение:
 * его видно в чате, его читают «ИИ ведёт этапы», автозаполнение и подсказки. Идёт перед разбором этапов.
 */
export async function aiTranscribePass(now = new Date()): Promise<{ done: number; failed: number } | null> {
  if (!aiFlagOn("crm.aiTranscribe", await getSetting("crm.aiTranscribe"))) return null;
  return container().messaging.autoTranscribe(new Date(now.getTime() - AI_TRANSCRIBE.lookbackDays * 86_400_000), AI_TRANSCRIBE.batch);
}
