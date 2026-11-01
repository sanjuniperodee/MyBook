"use client";

import { useMessages } from "@/i18n/client";
import { hasEmoji } from "@/lib/book/printable";

/** Эмодзи в тексте обложки: в шрифтах обложки их нет — ни в превью, ни в печати их не будет. */
export function EmojiNote({ text }: { text: string }) {
  const t = useMessages().books.cover;
  return hasEmoji(text) ? <p className="mt-1.5 text-xs text-amber-700">{t.emojiNote}</p> : null;
}
