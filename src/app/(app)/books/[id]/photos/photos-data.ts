import "server-only";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import type { User } from "@/server/auth";
import type { getAccessibleBook } from "@/server/books";
import {
  entriesToPlacePairs,
  localPhotosPageDtoForUser,
  localPhotosTabDto,
  type WebBookPhotosPageDto,
} from "@/server/v1-local-bridge-book";
import { v1WebRead } from "@/server/v1-web-client";
import type { PhotosTabData } from "./photos-tab";

type Book = Awaited<ReturnType<typeof getAccessibleBook>>;

function fromPhotosDto(dto: WebBookPhotosPageDto): PhotosTabData {
  return {
    ...dto,
    places: entriesToPlacePairs(dto.places),
  };
}

/**
 * Данные вкладки «Фото» — одна сборка для страницы сайта и приложения (API v1 cabinetPhotos): места фото по той же
 * сборке, что PDF (обложка, письма близких), обрезка на месте, главы и ответы для листа «Где стоит фото».
 */
export async function photosTabData(book: Book, editable: boolean, m: Messages, locale?: Locale): Promise<PhotosTabData> {
  const dto = await v1WebRead({
    name: "book.photosTab",
    section: "book",
    locale,
    local: () => localPhotosTabDto(book, editable, m),
    viaApi: (api) => api.webBookPhotosPage({ bookId: book.id, locale }),
  });
  return fromPhotosDto(dto);
}

/** Данные страницы /books/[id]/photos: с учётом права правки текущего пользователя (владелец или сотрудник с clients.edit). */
export async function loadPhotosPageData(book: Book, user: User, locale: Locale, m: Messages): Promise<PhotosTabData> {
  const dto = await v1WebRead({
    name: "book.photosPage",
    section: "book",
    locale,
    local: () => localPhotosPageDtoForUser(book, user, m),
    viaApi: (api) => api.webBookPhotosPage({ bookId: book.id, locale }),
  });
  return fromPhotosDto(dto);
}
