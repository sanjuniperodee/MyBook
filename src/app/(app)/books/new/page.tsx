import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { countQuestions, getTheme, getThemes, isThemeId } from "@/lib/content/themes";
import { getLocale, getMessages } from "@/i18n/server";
import { locales } from "@/i18n/config";
import { getCoverTemplate } from "@/lib/book/covers";
import { coverMeta } from "@/lib/book/covers/meta";
import { NewBookWizard, type WizardTheme } from "./NewBookWizard";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).books.wizard.meta };
}

export default async function NewBookPage({ searchParams }: { searchParams: Promise<{ theme?: string }> }) {
  const { theme } = await searchParams;
  // Ссылка ?theme=autobiography|blank переживает вход: тему возвращаем в адрес «после входа» (регистрация может быть закрыта).
  const user = await requireUser(theme && isThemeId(theme) ? `/books/new?theme=${theme}` : "/books/new");
  const locale = await getLocale();
  // Описание темы — на языке интерфейса, варианты названия — на каждом из языков книги.
  const list: WizardTheme[] = getThemes(locale).map((t) => ({
    id: t.id,
    kind: t.kind,
    recipient: t.recipient,
    name: t.name,
    description: t.description,
    questions: countQuestions(t),
    recipientLabel: t.recipientLabel,
    recipientPlaceholder: t.recipientPlaceholder,
    recipientGender: t.recipientGender,
    defaultRecipientGender: t.defaultRecipientGender,
    titleSuggestions: Object.fromEntries(locales.map((l) => [l, getTheme(t.id, l).titleSuggestions])) as WizardTheme["titleSuggestions"],
    firstChapterTitle: Object.fromEntries(locales.map((l) => [l, getTheme(t.id, l).firstChapterTitle ?? ""])) as WizardTheme["firstChapterTitle"],
    // Обложка темы — метаданные шаблона: мастер рисует её без каталога обложек в браузере.
    defaultCover: coverMeta(getCoverTemplate(t.defaultCover)),
  }));
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
      <NewBookWizard themes={list} defaultTheme={list.find((t) => t.id === theme)?.id} defaultAuthor={user.name} defaultLanguage={locale} />
    </main>
  );
}
