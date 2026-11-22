import { NextResponse } from "next/server";
import { z } from "zod";
import { container } from "@/server/container";
import { releaseTokenValid } from "@/server/support-release";

export const maxDuration = 120;

const body = z.object({
  release: z.string().max(120),
  commits: z.array(z.object({ sha: z.string().regex(/^[0-9a-f]{7,40}$/), subject: z.string().max(1000), body: z.string().max(10_000).optional() })).max(500),
});

/**
 * Вышел релиз (зовёт deploy/support-release.mjs после удачной выкатки): коммиты с «Обращение №N» закрывают обращения и
 * шлют уведомление на номер из обращения. Подпись — заголовок X-Release-Token.
 */
export async function POST(req: Request) {
  if (!releaseTokenValid(req.headers.get("x-release-token"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const tickets = await container().support.tickets.released(parsed.data);
  return NextResponse.json({ tickets });
}
