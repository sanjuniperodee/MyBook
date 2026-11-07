import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { container } from "@/server/container";
import { bookKind } from "@/lib/content/kinds";
import { inviteRecipient } from "@/lib/content/letter-invite";
import { PlainSheet, PlainShell } from "@/components/landing/PlainShell";
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

  const title = kind === "gift" && !custom ? t.headline(author || t.author) : t.headlineByKind[kind === "gift" ? "blank" : kind](author || t.author);
  const body = custom || (kind === "gift" ? t.text(recipient, book.title) : t.textByKind[kind](book.title));

  return (
    <PlainShell size="lg">
      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-14">
        {/* Приглашение: обложка книги и слова автора. Одно действие на странице — написать письмо. */}
        <header className="flex items-start gap-5 lg:sticky lg:top-8 lg:block lg:self-start">
          <div className="w-20 shrink-0 sm:w-24 lg:w-44">
            <CoverPreview template={template} format={book.format} title={book.title} lite className="rounded-[3px] shadow-book" />
          </div>
          <div className="min-w-0 lg:mt-7">
            <div className="text-sm text-muted">{t.invite}</div>
            <h1 className="mt-1.5 font-serif text-[32px] leading-[1.06] font-medium text-balance sm:text-[44px] lg:text-[38px]">{title}</h1>
          </div>
        </header>
        <div className="mt-6 min-w-0 lg:mt-0">
          <p className="text-lg leading-relaxed whitespace-pre-line text-ink-soft">{body}</p>
          <div className="mt-8">
            {book.status === "draft" ? (
              <PlainSheet>
                <LetterForm token={token} recipient={recipient} />
              </PlainSheet>
            ) : (
              <PlainSheet>
                <p className="py-4 text-center text-muted">{t.closed}</p>
              </PlainSheet>
            )}
          </div>
        </div>
      </div>
    </PlainShell>
  );
}
