import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { container } from "@/server/container";
import { bookKind } from "@/lib/content/kinds";
import { inviteRecipient } from "@/lib/content/letter-invite";
import { PlainIntro, PlainShell } from "@/components/landing/PlainShell";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { getCoverTemplate } from "@/lib/book/covers";
import { LetterForm } from "./LetterForm";
import { getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).gift.letter.meta, robots: { index: false } };
}

export default async function LetterPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(token)) notFound();
  const book = await container().authoring.queries.bookByInviteToken(token);
  if (!book) notFound();
  const t = (await getMessages()).gift.letter;
  const author = book.authorName.trim();
  const kind = bookKind(book.theme);
  // Свой текст приглашения автора — вместо текста по умолчанию; с ним имя получателя не подставляем нигде.
  const custom = book.inviteText.trim();
  // У автобиографии получателя нет; у своей книги он необязателен.
  const recipient = inviteRecipient(kind, book.recipientName, book.inviteText);
  // Фото-обложку не показываем посторонним — только дизайнерский шаблон.
  const template = getCoverTemplate(book.coverTemplate).requiresPhoto ? "linen" : book.coverTemplate;

  return (
    <PlainShell>
      <PlainIntro
        cover={<CoverPreview template={template} format={book.format} title={book.title} lite className="rounded-[3px] shadow-book" />}
        label={t.invite}
        title={
          // Со своим текстом у подарка — без «книги-сюрприза»: автор сам говорит, о какой книге речь.
          kind === "gift" && !custom ? t.headline(author || t.author) : t.headlineByKind[kind === "gift" ? "blank" : kind](author || t.author)
        }
        text={<p className="whitespace-pre-line">{custom || (kind === "gift" ? t.text(recipient, book.title) : t.textByKind[kind](book.title))}</p>}
      />
      <div className="mt-10">
        {book.status === "draft" ? (
          <LetterForm token={token} recipient={recipient} />
        ) : (
          <div className="rounded-[14px] border border-line bg-white p-8 text-center text-muted">{t.closed}</div>
        )}
      </div>
    </PlainShell>
  );
}
