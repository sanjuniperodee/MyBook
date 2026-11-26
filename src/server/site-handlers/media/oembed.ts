import { NextResponse } from "next/server";
import { MEDIA_TITLE_MAX, youtubeId } from "@/lib/book/answer-media";
import { api, apiUser } from "@/server/api";

/**
 * Название ролика YouTube для подписи QR-кода в редакторе (oEmbed — без ключа API). Только ролики YouTube:
 * сервер не ходит по произвольным адресам. Нет названия (ролик закрыт, сеть недоступна) — title: null, подпись
 * автор впишет сам.
 */
export const GET = api(async (req) => {
  await apiUser(req);
  const id = youtubeId(new URL(req.url).searchParams.get("url") ?? "");
  if (!id) return NextResponse.json({ title: null });
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, { signal: AbortSignal.timeout(4000) });
    const data = res.ok ? ((await res.json()) as { title?: unknown }) : null;
    const title = typeof data?.title === "string" ? data.title.replace(/\s+/g, " ").trim().slice(0, MEDIA_TITLE_MAX) : null;
    return NextResponse.json({ title: title || null }, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch {
    return NextResponse.json({ title: null });
  }
});
