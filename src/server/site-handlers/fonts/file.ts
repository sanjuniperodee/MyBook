import { readFile } from "node:fs/promises";
import path from "node:path";
import { fontFiles } from "@/lib/book/fonts";

/**
 * Файл шрифта книги (TTF из реестра lib/book/fonts.ts) — приложение рисует им подписи в своём шрифте (пары шрифтов
 * «Страниц»), как сайт. Шрифты открытые; файл не меняется — кэш навсегда.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  if (!fontFiles.has(file)) return new Response(null, { status: 404 });
  const data = await readFile(
    path.join(process.cwd(), "assets", "fonts", file),
  ).catch(() => null);
  if (!data) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "font/ttf",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
