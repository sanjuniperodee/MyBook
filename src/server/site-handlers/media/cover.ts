import "server-only";
import { notFound } from "next/navigation";
import { getCoverArt } from "@/server/cover-art";
import { fileRoute } from "@/server/file-route";

/**
 * Фон обложки (без текста) отдельным файлом: браузер кэширует его навсегда — версия в адресе
 * меняется вместе с кодом рисунков (COVER_ART_VERSION в next.config) и с правками шаблона в CRM.
 */
export const GET = fileRoute("cover-art", async (req: Request, { params }: { params: Promise<{ file: string }> }) => {
  const entry = await getCoverArt((await params).file);
  if (!entry) notFound();
  const accept = req.headers.get("accept-encoding") ?? "";
  const [body, encoding] = entry.br && /\bbr\b/.test(accept) ? [entry.br, "br"] : entry.gzip && /\bgzip\b/.test(accept) ? [entry.gzip, "gzip"] : [entry.raw, null];
  return new Response(typeof body === "string" ? body : new Uint8Array(body), {
    headers: {
      "Content-Type": entry.type,
      "Cache-Control": "public, max-age=31536000, immutable",
      Vary: "Accept-Encoding",
      ...(encoding ? { "Content-Encoding": encoding } : {}),
    },
  });
});
