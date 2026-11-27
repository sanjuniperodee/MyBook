import { notFound } from "@/shared/infrastructure/http/request";
import { getCurrentUser } from "@/server/auth";
import { can, getStaff } from "@/server/access";
import { container } from "@/server/container";
import { uuid } from "@/server/input";
import { fileRoute } from "@/server/file-route";

/** Фото отзыва: опубликованного — всем (кэшируется), остальных — только автору и сотруднику с правом на отзывы. */
export const GET = fileRoute("review-photo", async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const feedback = container().feedback;
  const photo = await feedback.queries.photo(id);
  if (!photo) notFound();
  if (!photo.published) {
    const user = await getCurrentUser();
    if (!user || (user.id !== photo.userId && !can(await getStaff(), "reviews.manage"))) notFound();
  }
  const data = await feedback.photoFile(photo.key);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": photo.published ? "public, max-age=86400" : "private, no-store",
    },
  });
});
