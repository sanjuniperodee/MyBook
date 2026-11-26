/**
 * Фото книги в API v1: загрузка, правка (подпись, раскладка, место, кадр), удаление. Тот же сервис и правила, что у
 * маршрутов сайта /api/books/[id]/photos: лимит фото книги, частота загрузок, ошибки по файлам на языке пользователя.
 */
import { getMessages } from "@/i18n/server";
import { formatPhotoUploadResult, toPhoto } from "@/modules/authoring/ui/booksView";
import { apiViewer, HttpError } from "@/server/api";
import { container } from "@/server/container";
import { maxPhotos } from "@/server/photoLimit";
import { rateLimit } from "@/server/rateLimit";
import type { Handlers } from "../app";

export { toPhoto };

export const photoHandlers: Pick<Handlers, "photoUpload" | "photoUpdate" | "photoDelete"> = {
  async photoUpload({ req, input }) {
    const { user, viewer } = await apiViewer(req, input.bookId);
    if (!(await rateLimit(`upload:${user.id}`, 60, 3600_000))) throw new HttpError(429, "photosRate");
    const files = input.files.map((f) => ({ name: f.name, size: f.size, bytes: async () => Buffer.from(await f.arrayBuffer()) }));
    const authoring = container().authoring;
    const result = await authoring.photos.upload(input.bookId, viewer, files, await maxPhotos());
    const t = (await getMessages()).api;
    const rows = await authoring.queries.photos(input.bookId);
    return formatPhotoUploadResult(rows, result, t);
  },

  async photoUpdate({ req, input }) {
    const { viewer } = await apiViewer(req, input.bookId);
    const authoring = container().authoring;
    await authoring.photos.update(input.bookId, viewer, input.photoId, input.body);
    const [rows, book] = await Promise.all([authoring.queries.photos(input.bookId), authoring.queries.book(input.bookId)]);
    const photo = rows.find((p) => p.id === input.photoId);
    if (!photo) throw new HttpError(404, "notFound");
    return { photo: toPhoto(photo), layoutRev: book?.layoutRev ?? 1 };
  },

  async photoDelete({ req, input }) {
    const { viewer } = await apiViewer(req, input.bookId);
    await container().authoring.photos.delete(input.bookId, viewer, input.photoId);
    return { ok: true };
  },
};
