import { notFound } from "next/navigation";
import { getCurrentUser, isStaff } from "@/server/auth";
import { container } from "@/server/container";

/** Фото отзыва: опубликованного — всем (кэшируется), остальных — только автору и сотрудникам. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const feedback = container().feedback;
  const photo = await feedback.queries.photo(id);
  if (!photo) notFound();
  if (!photo.published) {
    const user = await getCurrentUser();
    if (!user || (user.id !== photo.userId && !isStaff(user))) notFound();
  }
  const data = await feedback.photoFile(photo.key);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": photo.published ? "public, max-age=86400" : "private, no-store",
    },
  });
}
