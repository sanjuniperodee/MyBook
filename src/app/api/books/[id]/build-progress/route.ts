import { NextResponse } from "next/server";
import { api, apiBook } from "@/server/api";
import { container } from "@/server/container";
import { idParams } from "@/server/input";

/**
 * Ход идущей экранной сборки книги (BuildProgress; null — сборки нет). Экран спрашивает его раз в секунду, пока ждёт
 * страницы: в отличие от /build, не загружает книгу и не считает отпечаток — читает только память сервера.
 */
export const GET = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = idParams(await params, "id");
  await apiBook(req, id);
  return NextResponse.json({ progress: container().previews.progressOf(id) }, { headers: { "Cache-Control": "private, no-store" } });
});
