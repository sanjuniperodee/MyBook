import { NextResponse } from "next/server";
import { findLink, linkTarget, recordClick } from "@/lib/crm/links";
import { env } from "@/lib/env";

/** Короткая рекламная ссылка: считаем переход и ведём на сайт с UTM-метками или в WhatsApp с кодом ссылки. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const link = /^[a-z0-9-]{1,40}$/i.test(slug) ? await findLink(slug) : null;
  if (!link || link.archived) return NextResponse.redirect(env.appUrl, 302);
  // Роботы превью ссылок (мессенджеры, соцсети) не должны накручивать переходы.
  const ua = req.headers.get("user-agent") ?? "";
  if (!/bot|crawler|spider|preview|facebookexternalhit|WhatsApp|TelegramBot|Slackbot|vkShare/i.test(ua)) await recordClick(link.id).catch((err) => console.error("[go] click", err));
  return NextResponse.redirect(await linkTarget(link), { status: 302, headers: { "Cache-Control": "no-store" } });
}
