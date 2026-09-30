import { getGiftByToken, getGiftPdf } from "@/lib/gifts";
import { messagesFor } from "@/i18n/messages";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const gift = await getGiftByToken(token);
  if (!gift || gift.status !== "paid") return new Response(null, { status: 404 });
  const pdf = await getGiftPdf(gift);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${messagesFor(gift.locale).gift.card.filename(gift.number)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
