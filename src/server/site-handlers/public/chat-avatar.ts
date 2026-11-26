import { container } from "@/server/container";

/**
 * Фото профиля клиента WhatsApp для чатов CRM и приложения. Ссылка подписана (её выдаёт сервер в списке чатов) и
 * меняется вместе с фото, поэтому файл кэшируется навсегда; без подписи — 404.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const data = await container().messaging.avatarFile((await params).file);
  if (!data) return new Response(null, { status: 404 });
  return new Response(Buffer.from(data), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}
