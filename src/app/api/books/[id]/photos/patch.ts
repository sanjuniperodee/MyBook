/**
 * Правка фото из редактора — одна (PATCH …/photos/[pid]) или пачкой (POST …/photos/batch): правила места проверяет домен
 * (Photo.update). Схема — из контракта API v1 (PhotoPatch): та же, что у PATCH /api/v1/books/{id}/photos/{id}.
 */
export { PhotoPatch as photoPatchSchema } from "@mybook/contracts";
