import { container } from "@/server/container";
import { messagesFor } from "@/i18n/messages";
import { fileRoute } from "@/server/file-route";

export const GET = fileRoute("gift-pdf", async (_req: Request, { params }: { params: Promise<{ token: string }> }) => {
  const { token } = await params;
  const found = await container().ordering.giftPdf(token);
  if (!found || found.gift.status !== "paid") return new Response(null, { status: 404 });
  const { gift, pdf } = found;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${messagesFor(gift.locale).gift.card.filename(gift.number)}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
