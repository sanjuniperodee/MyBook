/**
 * Мастер новой книги в API v1 — для приложения «MyBooks»: то же, что страница /books/new сайта (getThemes, occasionsFor,
 * сообщения books.wizard), — виды книг с обложкой темы, вариантами названия и первой главы на каждом языке книги, поводы
 * с датами и все надписи мастера. Создание — bookCreate (books.ts); подсказка «до какого дня заказать» — wizardDeadline.
 */
import { z } from "zod";
import { route, schemas, type RouteDef } from "./core";

export const WizardTheme = z
  .object({
    id: z.string(),
    /** gift — подарок, autobiography — о себе, blank — своя книга. */
    kind: z.enum(["gift", "autobiography", "blank"]),
    /** Группа в выборе: gift — «Книга-подарок», own — «Книга о себе или своя». */
    group: z.enum(["gift", "own"]),
    recipient: z.enum(["required", "optional", "none"]),
    name: z.string(),
    description: z.string(),
    /** «176 вопросов» или «Без готовых вопросов». */
    questionsLabel: z.string(),
    /** Обложка темы — графика шаблона без текста (путь от сайта). */
    coverUrl: z.string(),
    recipientLabel: z.string().nullable(),
    recipientPlaceholder: z.string().nullable(),
    recipientGender: z.enum(["m", "f"]).nullable(),
    recipientGenderChoice: z.boolean(),
    defaultRecipientGender: z.enum(["m", "f"]),
    /** Варианты названия и название первой главы — на каждом языке книги (список: генератор Dart типизирует его). */
    perLanguage: z.array(z.object({ language: z.string(), titles: z.array(z.string()), firstChapter: z.string() })),
    /** Поводы для этой темы (ближайшие — первыми), у фиксированных — дата ближайшего, ГГГГ-ММ-ДД. */
    occasions: z.array(z.object({ id: z.string(), label: z.string(), date: z.string().nullable() })),
  })
  .register(schemas, { id: "WizardTheme" });

export const BookWizard = z
  .object({
    themes: z.array(WizardTheme),
    languages: z.array(z.object({ id: z.string(), label: z.string() })),
    defaultLanguage: z.string(),
    /** Имя пользователя — начальное «Ваше имя». */
    defaultAuthor: z.string(),
    /** Наибольшие длины полей (как у сайта). */
    limits: z.object({ authorName: z.number().int(), recipientName: z.number().int(), title: z.number().int(), recordedBy: z.number().int(), dedication: z.number().int(), firstChapterTitle: z.number().int() }),
    /** Надписи мастера — сообщения books.wizard и common.occasion сайта. */
    labels: z.object({
      whoTitle: z.string(),
      whoText: z.string(),
      groups: z.object({ gift: z.string(), own: z.string() }),
      steps: z.array(z.string()),
      stepOf: z.array(z.string()),
      stepTitles: z.object({ names: z.string(), namesBlank: z.string(), title: z.string() }),
      detailsText: z.string(),
      detailsTextBlank: z.string(),
      titleText: z.string(),
      authorName: z.string(),
      authorAs: z.string(),
      genders: z.object({ author: z.array(z.string()), recipient: z.array(z.string()) }),
      recipientFor: z.string(),
      story: z.object({
        title: z.string(),
        own: z.string(),
        other: z.string(),
        narratorName: z.string(),
        narratorNamePlaceholder: z.string(),
        narratorAs: z.string(),
        recordedBy: z.string(),
        recordedByPlaceholder: z.string(),
        recordedByHint: z.string(),
        dedication: z.string(),
        dedicationPlaceholder: z.string(),
        dedicationHint: z.string(),
      }),
      blank: z.object({ authorName: z.string(), firstChapter: z.string(), firstChapterHint: z.string(), titleHint: z.string() }),
      language: z.string(),
      languageHint: z.string(),
      languageHintBlank: z.string(),
      bookTitle: z.string(),
      occasion: z.string(),
      occasionHint: z.string(),
      occasionDate: z.string(),
      occasionPickDate: z.string(),
      optional: z.string(),
      submit: z.string(),
      pending: z.string(),
      coverNote: z.string(),
      next: z.string(),
      prev: z.string(),
      back: z.string(),
      previewTitle: z.string(),
      errors: z.object({ authorName: z.string(), recipientName: z.string(), title: z.string() }),
    }),
  })
  .register(schemas, { id: "BookWizard" });

export const WizardDeadline = z.object({ text: z.string().nullable() }).register(schemas, { id: "WizardDeadline" });

export const wizardRoutes = {
  bookWizard: route({ method: "GET", path: "/api/v1/books/new", auth: "user", tag: "books", summary: "Мастер новой книги: виды книг, поводы, надписи (как /books/new сайта)", response: BookWizard }),
  wizardDeadline: route({
    method: "GET",
    path: "/api/v1/occasions/deadline",
    auth: "user",
    tag: "books",
    summary: "Подсказка мастера: до какого дня заказать, чтобы книга успела к дате повода",
    query: z.object({ occasion: z.string(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
    response: WizardDeadline,
  }),
} as const satisfies Record<string, RouteDef>;
