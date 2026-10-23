import { NextResponse } from "next/server";
import { z } from "zod";
import { aiTemplateDraftAction } from "@/app/admin/ai-actions";
import { apiStaff } from "@/server/api";
import { mobile } from "@/server/mobile-api";

export const dynamic = "force-dynamic";

/** Черновик шаблона из сообщения диалога: данные клиента заменены подстановками (код + ИИ), название. Только предложение. */
export const POST = mobile(async (req) => {
  await apiStaff(req, "chats.view");
  const { chatId, messageId } = z.object({ chatId: z.string(), messageId: z.string() }).parse(await req.json());
  const r = await aiTemplateDraftAction(chatId, messageId);
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: 400 });
  return NextResponse.json({ title: r.title, text: r.text, replaced: r.replaced, ai: r.ai });
});
