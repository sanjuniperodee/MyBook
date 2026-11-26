import type { z } from "zod";
import { COVER_TEXT_MAX, type BookWizard, type WizardDeadline } from "@mybook/contracts";
import { localeMeta, locales, type Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import { getCoverTemplate } from "@/lib/book/covers";
import { DEDICATION_MAX } from "@/lib/book/create-book-schema";
import { CHAPTER_TITLE_MAX, RECORDED_BY_MAX } from "@/lib/content/kinds";
import { countQuestions, getTheme, getThemes } from "@/lib/content/themes";
import { nowMs } from "@/lib/dates";
import { deadlineFor, getOccasion, nextFixedDate, occasionsFor } from "@/lib/occasions";
import { coverArtUrl } from "@/lib/urls";

/** Формат обложки темы в мастере — как на сайте (CoverFace рисует шаблон в формате по умолчанию). */
const WIZARD_FORMAT = "a5";

/**
 * Данные мастера новой книги и подсказки срока к празднику — общие для mybook-api и бэкенда на Nest (ADR 0014).
 */
export function buildBookWizardView(locale: Locale, m: Messages, defaultAuthor: string, now: Date = new Date(nowMs())): z.output<typeof BookWizard> {
  const t = m.books.wizard;
  return {
    themes: getThemes(locale).map((th) => ({
      id: th.id,
      kind: th.kind,
      group: th.kind === "gift" ? ("gift" as const) : ("own" as const),
      recipient: th.recipient,
      name: th.kind === "gift" ? th.name : t.cards[th.kind].name,
      description: th.kind === "gift" ? th.description : t.cards[th.kind].description,
      questionsLabel: th.kind === "blank" ? t.noQuestions : t.questions(countQuestions(th)),
      coverUrl: coverArtUrl(getCoverTemplate(th.defaultCover), WIZARD_FORMAT, true),
      recipientLabel: th.recipientLabel ?? null,
      recipientPlaceholder: th.recipientPlaceholder ?? null,
      recipientGender: th.recipientGender ?? null,
      recipientGenderChoice: !!th.recipientGenderChoice,
      defaultRecipientGender: th.defaultRecipientGender,
      perLanguage: locales.map((l) => ({ language: l, titles: getTheme(th.id, l).titleSuggestions, firstChapter: getTheme(th.id, l).firstChapterTitle ?? "" })),
      occasions: occasionsFor(th.id, now).map((o) => ({ id: o.id, label: m.common.occasions[o.id].label, date: nextFixedDate(o, now) })),
    })),
    languages: locales.map((l) => ({ id: l, label: localeMeta[l].label })),
    defaultLanguage: locale,
    defaultAuthor,
    limits: {
      authorName: COVER_TEXT_MAX.authorName,
      recipientName: COVER_TEXT_MAX.recipientName,
      title: COVER_TEXT_MAX.title,
      recordedBy: RECORDED_BY_MAX,
      dedication: DEDICATION_MAX,
      firstChapterTitle: CHAPTER_TITLE_MAX,
    },
    labels: {
      whoTitle: t.whoTitle,
      whoText: t.whoText,
      groups: t.groups,
      steps: [t.steps.theme, t.steps.names, t.steps.title],
      stepOf: [1, 2, 3].map((i) => t.stepOf(i, 3)),
      stepTitles: t.stepTitles,
      detailsText: t.detailsText,
      detailsTextBlank: t.detailsTextBlank,
      titleText: t.titleText,
      authorName: t.authorName,
      authorAs: t.authorAs,
      genders: { author: [...t.genders.author], recipient: [...t.genders.recipient] },
      recipientFor: t.recipientFor,
      story: t.story,
      blank: t.blank,
      language: t.language,
      languageHint: t.languageHint,
      languageHintBlank: t.languageHintBlank,
      bookTitle: t.bookTitle,
      occasion: t.occasion,
      occasionHint: t.occasionHint,
      occasionDate: m.common.occasion.date,
      occasionPickDate: m.common.occasion.pickDate,
      optional: t.optional,
      submit: t.submit,
      pending: t.pending,
      coverNote: t.coverNote,
      next: t.next,
      prev: t.prev,
      back: t.back,
      previewTitle: t.previewTitle,
      errors: { authorName: t.errors.authorName, recipientName: t.errors.recipientName, title: t.errors.title },
    },
  };
}

export function buildWizardDeadlineView(occasion: string, date: string, m: Messages, now: Date = new Date(nowMs())): z.output<typeof WizardDeadline> {
  const o = getOccasion(occasion);
  if (!o) return { text: null };
  const dl = deadlineFor(date, now);
  const c = m.common.occasion;
  const text =
    dl.state === "past"
      ? null
      : dl.state === "digital"
        ? c.digitalOnly
        : dl.state === "premium"
          ? c.premiumOnly(dl.orderByPremium)
          : c.orderBy(m.common.occasions[o.id], dl.daysToTarget, dl.orderBy);
  return { text };
}
