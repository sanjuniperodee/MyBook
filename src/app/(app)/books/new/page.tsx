import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { countQuestions, getTheme, getThemes, isThemeId } from "@/lib/content/themes";
import { getLocale, getMessages } from "@/i18n/server";
import { locales } from "@/i18n/config";
import { NewBookWizard, type WizardTheme } from "./NewBookWizard";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).books.wizard.meta };
}

export default async function NewBookPage({ searchParams }: { searchParams: Promise<{ theme?: string }> }) {
  const user = await requireUser("/books/new");
  const { theme } = await searchParams;
  const locale = await getLocale();
  // Описание темы — на языке интерфейса, варианты названия — на каждом из языков книги.
  const list: WizardTheme[] = getThemes(locale).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    questions: countQuestions(t),
    recipientLabel: t.recipientLabel,
    recipientPlaceholder: t.recipientPlaceholder,
    recipientGender: t.recipientGender,
    defaultRecipientGender: t.defaultRecipientGender,
    titleSuggestions: Object.fromEntries(locales.map((l) => [l, getTheme(t.id, l).titleSuggestions])) as WizardTheme["titleSuggestions"],
    defaultCover: t.defaultCover,
  }));
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
      <NewBookWizard themes={list} defaultTheme={theme && isThemeId(theme) ? theme : undefined} defaultAuthor={user.name} defaultLanguage={locale} />
    </main>
  );
}
