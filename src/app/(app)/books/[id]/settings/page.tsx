import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getAccessibleBook } from "@/lib/books";
import { getTheme } from "@/lib/content/themes";
import { getTypography } from "@/lib/book/fonts";
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
      <div className="mt-6">
        <SettingsForm
          bookId={book.id}
          editable={book.status === "draft"}
          fixedRecipientGender={!!theme.recipientGender}
          initial={{
            typography: getTypography(book.typography).id,
            format: getFormat(book.format).id,
            dedication: book.dedication,
            photoPlacement: book.photoPlacement,
            showToc: book.showToc,
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
