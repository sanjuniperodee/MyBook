import { NextResponse } from "next/server";
import { BoardsError, boardsErrorStatus } from "@/modules/boards";
import { api, apiStaff, HttpError } from "@/server/api";
import { boardViewer } from "@/server/boards-api";
import { container } from "@/server/container";
import { idParams } from "@/server/input";
import { serveStorageFile } from "@/server/range-file";

/** Вложение карточки доски: права — как на просмотр карточки; ?download=1 — скачать файлом. */
export const GET = api(async (req: Request, { params }: { params: Promise<{ id: string; att: string }> }) => {
  const staff = await apiStaff(req);
  const p = idParams(await params, "id", "att");
  let attachment;
  try {
    attachment = await container().boards.cards.file(boardViewer(staff), p.id, p.att);
  } catch (err) {
    if (BoardsError.is(err)) return NextResponse.json({ error: err.message }, { status: boardsErrorStatus(err.code) });
    throw err;
  }
  const download = new URL(req.url).searchParams.get("download") === "1";
  const name = encodeURIComponent(attachment.name);
  const res = await serveStorageFile(
    attachment.storageKey,
    attachment.mime || "application/octet-stream",
    req,
    {
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${name}`,
      "X-Content-Type-Options": "nosniff",
      // Загруженный файл — чужой: HTML и SVG не исполняем как страницу сайта.
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; media-src 'self'",
    },
    (r) => container().boards.openFile(attachment.storageKey, r),
  );
  if (!res) throw new HttpError(404, "notFound");
  return res;
});
