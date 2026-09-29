import { getGiftByToken, getGiftPdf } from "@/lib/gifts";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const gift = await getGiftByToken(token);
  if (!gift || gift.status !== "paid") return new Response("Не найдено", { status: 404 });
  const pdf = await getGiftPdf(gift);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="mybook-gift-${gift.number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
