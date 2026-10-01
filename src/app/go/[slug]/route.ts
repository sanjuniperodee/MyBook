import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { container } from "@/server/container";

/** Короткая рекламная ссылка: считаем переход и ведём на сайт с UTM-метками или в WhatsApp с кодом ссылки. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const target = await container().marketing.service.follow(slug, req.headers.get("user-agent") ?? "");
  if (!target) return NextResponse.redirect(env.appUrl, 302);
  return NextResponse.redirect(target, { status: 302, headers: { "Cache-Control": "no-store" } });
}
