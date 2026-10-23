import { NextResponse } from "next/server";
import { z } from "zod";
import { admin } from "@/i18n/admin";
import { forwardMessageAction } from "@/app/admin/chats/actions";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";

export const dynamic = "force-dynamic";

/**
 * Переслать выбранные сообщения (до 30) в другие диалоги (до 10): по порядку, как в ленте. Ответ — сколько сообщений
 * переслано и что не ушло и почему (как итог в CRM).
 */
export const POST = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await apiStaff(req, "chats.view", "chats.send");
  const { id } = idParams(await params, "id");
  const body = z.object({ messageIds: z.array(z.string()).min(1).max(30), targetIds: z.array(z.string()).min(1).max(10) }).parse(await req.json());
  const failed = new Set<string>();
  let ok = 0;
  for (const messageId of body.messageIds) {
    const r = await forwardMessageAction(id, messageId, body.targetIds);
    if (r.error) {
      failed.add(r.error);
      continue;
    }
    ok++;
    r.failed?.forEach((f) => failed.add(`${f.title} — ${f.error}`));
  }
  if (!ok) return NextResponse.json({ error: [...failed].join("; ") || admin.mobileForwardFailed }, { status: 400 });
  return NextResponse.json({ ok: true, forwarded: ok, total: body.messageIds.length, failed: [...failed] });
});
