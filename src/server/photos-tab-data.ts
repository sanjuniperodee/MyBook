import "server-only";
import type { Messages } from "@/i18n/messages";
import type { BookRow } from "@/modules/authoring";
import { entriesToPlacePairs, localPhotosTabDto } from "./v1-local-bridge-book";

/** Данные вкладки «Фото» для обработчиков mybook-api (приложение, редактор фото): та же сборка, что у страницы сайта. */
export async function photosTabData(book: BookRow, editable: boolean, m: Messages) {
  const dto = await localPhotosTabDto(book, editable, m);
  return { ...dto, places: entriesToPlacePairs(dto.places) };
}
