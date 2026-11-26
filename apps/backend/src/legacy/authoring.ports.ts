import type { Provider } from "@nestjs/common";
import type { Container } from "@/server/container";
import { probeOriginalImage, renderPhotoEdit } from "@/server/photo-edit-render";
import { maxPhotos } from "@/server/photoLimit";
import {
  AUTHORING,
  AUTHORING_ASSISTANT,
  AUTHORING_BOOK_OWNERSHIP,
  AUTHORING_ORDERING,
  AUTHORING_PHOTO_LIMIT,
  AUTHORING_PHOTO_RENDERER,
  AUTHORING_PREVIEWS,
  type AuthoringAssistantPort,
  type AuthoringFacade,
  type AuthoringOrderingPort,
  type AuthoringPreviewsPort,
  type BookOwnershipPort,
  type PhotoEditRendererPort,
  type PhotoLimitPort,
} from "../modules/authoring/authoring.tokens";
import { LEGACY_CONTAINER } from "./legacy.tokens";

/**
 * Адаптеры переходного периода для Authoring: связывают порты Nest-модуля со старым контейнером и серверными
 * утилитами без next/headers (БД, хранилище, sharp, Production, Assistant, Ordering, Reporting).
 */
export const legacyAuthoringProviders: Provider[] = [
  {
    provide: AUTHORING,
    useFactory: (c: Container): AuthoringFacade => c.authoring,
    inject: [LEGACY_CONTAINER],
  },
  {
    provide: AUTHORING_BOOK_OWNERSHIP,
    useFactory: (c: Container): BookOwnershipPort => ({
      bookOwnership: (bookId) => c.reporting.bookOwnership(bookId),
    }),
    inject: [LEGACY_CONTAINER],
  },
  {
    provide: AUTHORING_ORDERING,
    useFactory: (c: Container): AuthoringOrderingPort => ({
      userOrders: (userId) => c.ordering.queries.userOrders(userId),
      lastOrderOfBook: (bookId) => c.ordering.queries.lastOrderOfBook(bookId),
      agreementFor: (userId) => c.ordering.orders.agreementFor(userId),
    }),
    inject: [LEGACY_CONTAINER],
  },
  {
    provide: AUTHORING_PREVIEWS,
    useFactory: (c: Container): AuthoringPreviewsPort => ({
      current: (bookId) => c.previews.current(bookId),
      build: (bookId, opts) => c.previews.build(bookId, opts),
      progressOf: (bookId) => c.previews.progressOf(bookId),
    }),
    inject: [LEGACY_CONTAINER],
  },
  {
    provide: AUTHORING_ASSISTANT,
    useFactory: (c: Container): AuthoringAssistantPort => ({
      dictate: (input) => c.assistant.dictate(input),
      proofreadConfigured: () => c.assistant.proofreader.configured(),
      writerConfigured: () => c.assistant.writer.configured(),
    }),
    inject: [LEGACY_CONTAINER],
  },
  {
    provide: AUTHORING_PHOTO_LIMIT,
    useValue: { maxPhotos } satisfies PhotoLimitPort,
  },
  {
    provide: AUTHORING_PHOTO_RENDERER,
    useValue: { probeOriginal: probeOriginalImage, renderEdit: renderPhotoEdit } satisfies PhotoEditRendererPort,
  },
];

export const legacyAuthoringExports = [
  AUTHORING,
  AUTHORING_BOOK_OWNERSHIP,
  AUTHORING_ORDERING,
  AUTHORING_PREVIEWS,
  AUTHORING_ASSISTANT,
  AUTHORING_PHOTO_LIMIT,
  AUTHORING_PHOTO_RENDERER,
] as const;
