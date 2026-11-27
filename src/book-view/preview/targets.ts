/**
 * Что нажали в превью «Так будет в книге» — ключами, как у полос сборки PDF (BookBuildPage: вид полосы и глава):
 * начальная полоса главы, страница фото после главы, альбом в конце. Те же обработчики подойдут полосам-картинкам,
 * когда редактор перейдёт на растр макета. У альбома главы нет (служебный ключ знает только сборка).
 */
export interface PreviewTarget {
  kind: "opener" | "photo" | "gallery";
  chapterKey?: string;
  /** Снимок страницы фото, если он на ней один. */
  photoId?: string;
}

export type OnPreviewTarget = (target: PreviewTarget) => void;
