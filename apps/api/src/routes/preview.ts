/**
 * Предпросмотр книги в API v1: та же экранная сборка, что у сайта (previews.build / progressOf), в плоском виде для
 * клиентов (authoring/ui/previewView.ts). Картинки полос и PDF отдают маршруты сайта по адресам из ответа.
 */
import { toBuildProgressDto, toBuildStateDto } from "@/modules/authoring/ui/previewView";
import { apiBook, HttpError } from "@/server/api";
import { container } from "@/server/container";
import type { Handlers } from "../app";

export const previewHandlers: Pick<Handlers, "bookBuild" | "bookBuildProgress"> = {
  async bookBuild({ req, input }) {
    await apiBook(req, input.bookId);
    const state = await container().previews.build(input.bookId, { retry: input.retry === "1" });
    if (!state) throw new HttpError(404, "bookNotFound");
    return toBuildStateDto(input.bookId, state);
  },

  async bookBuildProgress({ req, input }) {
    await apiBook(req, input.bookId);
    return toBuildProgressDto(container().previews.progressOf(input.bookId));
  },
};
