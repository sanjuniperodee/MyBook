import { NextResponse } from "next/server";
import { api, apiBook } from "@/server/api";
import { idParams } from "@/server/input";
import {
  designAiBody,
  designAiInfo,
  runDesignAiRequest,
} from "@/server/design-ai-request";

export const maxDuration = 120;

/** Остаток лимита ИИ-дизайнера, пакеты и подсказки под книгу (src/server/design-ai-request.ts — общий с API v1). */
export const GET = api(
  async (req, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = idParams(await params, "id");
    const { user, book } = await apiBook(req, id);
    return NextResponse.json(await designAiInfo(user.id, book));
  },
);

/** Просьба к ИИ-дизайнеру (правка, с нуля, варианты, оценка) — для страниц или обложки. */
export const POST = api(
  async (req, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = idParams(await params, "id");
    const { user, book } = await apiBook(req, id, { editable: true });
    return NextResponse.json(
      await runDesignAiRequest(
        user,
        book,
        designAiBody.parse(await req.json()),
      ),
    );
  },
);
