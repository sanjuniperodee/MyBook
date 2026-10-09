import { notFound } from "next/navigation";
import { coverPhotoResized, isCoverPhotoKey } from "@/server/cover-photos";

/** Снимок шаблона обложки для браузера: превью в выборе, редакторе и 3D-книге. Файлы не меняются — кэш навсегда. */
const WIDTHS = [480, 900, 1600, 2400];

export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const key = decodeURIComponent((await params).key);
  if (!isCoverPhotoKey(key)) notFound();
  const asked = Number(new URL(req.url).searchParams.get("w")) || 1600;
  const width = WIDTHS.find((w) => w >= asked) ?? WIDTHS[WIDTHS.length - 1];
  let body: Buffer;
  try {
    body = await coverPhotoResized(key, width);
  } catch {
    notFound();
  }
  return new Response(new Uint8Array(body), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
