import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { getAccessibleBook } from "@/server/books";
import { getTheme } from "@/lib/content/themes";
import { ArrowRight, BookOpen } from "lucide-react";
import { Link } from "@/i18n/client";
import { getFormat } from "@/lib/book/formats";
import { SettingsForm } from "./SettingsForm";
import { getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).books.settings.meta };
}

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/books/${id}/settings`);
  const book = await getAccessibleBook(id, user);
  const theme = getTheme(book.theme);
  const t = (await getMessages()).books.settings;
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="font-serif text-4xl font-medium sm:text-5xl">{t.title}</h1>
      {/* Оформление страниц, посвящение и оглавление переехали во вкладку «Страницы» */}
      <Link href={`/books/${book.id}/pages`} className="group mt-6 flex items-center gap-4 rounded-2xl bg-cream/70 px-5 py-4 transition hover:bg-cream">
        <BookOpen className="size-5 shrink-0 text-wine" strokeWidth={1.8} />
        <span className="min-w-0 flex-1 text-sm">
          <span className="font-medium">{t.pagesLink}</span> <span className="text-muted">{t.pagesLinkText}</span>
        </span>
        <ArrowRight className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-ink" />
      </Link>
      <div className="mt-6">
        <SettingsForm
          bookId={book.id}
          theme={book.theme}
          editable={book.status === "draft"}
          fixedRecipientGender={!!theme.recipientGender}
          initial={{
            format: getFormat(book.format).id,
            authorGender: book.authorGender,
            recipientGender: book.recipientGender,
            occasion: book.occasion,
            occasionDate: book.occasionDate,
            language: book.language,
          }}
        />
      </div>
    </main>
  );
}
