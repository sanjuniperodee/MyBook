import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { countQuestions, isThemeId, themes } from "@/lib/content/themes";
import { NewBookWizard, type WizardTheme } from "./NewBookWizard";

export const metadata: Metadata = { title: "Новая книга" };

export default async function NewBookPage({ searchParams }: { searchParams: Promise<{ theme?: string }> }) {
  const user = await requireUser("/books/new");
  const { theme } = await searchParams;
  const list: WizardTheme[] = themes.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    questions: countQuestions(t),
    recipientLabel: t.recipientLabel,
    recipientPlaceholder: t.recipientPlaceholder,
    recipientGender: t.recipientGender,
    defaultRecipientGender: t.defaultRecipientGender,
    titleSuggestions: t.titleSuggestions,
    defaultCover: t.defaultCover,
  }));
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
      <NewBookWizard themes={list} defaultTheme={theme && isThemeId(theme) ? theme : undefined} defaultAuthor={user.name} />
    </main>
  );
}
