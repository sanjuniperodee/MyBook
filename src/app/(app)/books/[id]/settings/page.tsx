import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getAccessibleBook } from "@/lib/books";
import { getTheme } from "@/lib/content/themes";
import { getTypography } from "@/lib/book/fonts";
import { getFormat } from "@/lib/book/formats";
import { SettingsForm } from "./SettingsForm";

export const metadata: Metadata = { title: "Оформление" };

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/books/${id}/settings`);
  const book = await getAccessibleBook(id, user);
  const theme = getTheme(book.theme);
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="font-serif text-4xl font-medium sm:text-5xl">Оформление книги</h1>
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
          }}
        />
      </div>
    </main>
  );
}
