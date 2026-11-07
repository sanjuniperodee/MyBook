import type { Metadata } from "next";
import { ToolHeader } from "../ToolHeader";
import { requireUser } from "@/server/auth";
import { getAccessibleBook } from "@/server/books";
import { getTheme } from "@/lib/content/themes";
import { BookOpen, ChevronRight } from "lucide-react";
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
  const m = await getMessages();
  const t = m.books.settings;
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <ToolHeader title={t.title} description={m.books.tools.settings} />
      {/* Оформление страниц, посвящение и оглавление переехали во вкладку «Страницы» */}
      <Link href={`/books/${book.id}/pages`} className="group flex min-h-12 items-center gap-3 rounded-[14px] border border-line bg-white px-4 py-3 transition hover:border-line-strong">
        <BookOpen className="size-5 shrink-0 text-wine" strokeWidth={1.8} />
        <span className="min-w-0 flex-1 text-sm">
          <span className="font-medium">{t.pagesLink}</span> <span className="text-muted">{t.pagesLinkText}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted transition group-hover:text-ink" aria-hidden />
      </Link>
      <div className="mt-8">
        <SettingsForm
          bookId={book.id}
          theme={book.theme}
          editable={book.status === "draft"}
          fixedRecipientGender={!!theme.recipientGender || theme.recipientGenderChoice === false}
          initial={{
            format: getFormat(book.format).id,
            authorName: book.authorName,
            authorGender: book.authorGender,
            recordedBy: book.recordedBy,
            recipientName: book.recipientName,
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
