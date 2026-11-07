import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Mic, RefreshCw } from "lucide-react";
import { PlainShell } from "@/components/landing/PlainShell";
import { getLocale, getMessages } from "@/i18n/server";
import { localizePath } from "@/i18n/config";
import { FILE_TOKEN, formatDuration } from "@/lib/book/answer-files";
import { publicFile } from "@/server/answerFiles";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const t = (await getMessages()).answerFile;
  const found = FILE_TOKEN.test(token) ? await publicFile(token) : null;
  return { title: found ? t.meta[found.file.kind] : t.meta.video, robots: { index: false, follow: false } };
}

/**
 * Свой файл из книги — страница, которую открывает QR-код на странице книги: проигрыватель, подпись карточки и название
 * книги. Открывается без входа по секретной ссылке; ссылка не меняется ни после заказа, ни после печати.
 */
export default async function AnswerFilePage({ params }: Props) {
  const { token } = await params;
  if (!FILE_TOKEN.test(token)) notFound();
  const found = await publicFile(token);
  if (!found) notFound();
  const { file, bookTitle, authorName, caption } = found;
  const t = (await getMessages()).answerFile;
  const locale = await getLocale();
  const src = `/api/v/${token}`;
  return (
    <PlainShell className="pt-8 sm:pt-12">
        <div className="text-sm text-muted">{t.fromBook(bookTitle.trim())}</div>
        {caption ? <h1 className="mt-2 font-serif text-[34px] leading-[1.08] font-medium text-balance sm:text-5xl">{caption}</h1> : null}
        {authorName.trim() ? <p className="mt-2 text-ink-soft">{authorName.trim()}</p> : null}

        <div className="mt-6">
          {file.status === "ready" ? (
            file.kind === "video" ? (
              <video
                controls
                playsInline
                preload="metadata"
                poster={file.hasPoster ? `${src}?poster=1` : undefined}
                className="max-h-[78dvh] w-full rounded-[14px] bg-black shadow-book"
                style={file.width && file.height ? { aspectRatio: `${file.width} / ${file.height}` } : undefined}
              >
                <source src={src} type="video/mp4" />
                {t.noPlayer}
              </video>
            ) : (
              <div className="flex flex-col gap-4 rounded-[14px] border border-line bg-white p-5 sm:p-7">
                <div className="flex items-center gap-3">
                  <span className="grid size-12 shrink-0 place-items-center rounded-full bg-wine text-white">
                    <Mic className="size-5" />
                  </span>
                  {file.durationSec ? <span className="text-sm text-muted tabular-nums">{formatDuration(file.durationSec)}</span> : null}
                </div>
                <audio controls preload="metadata" className="w-full">
                  <source src={src} type="audio/mp4" />
                  {t.noPlayer}
                </audio>
              </div>
            )
          ) : (
            <div className="rounded-[14px] border border-line bg-white p-8 text-center text-muted">
              <p>{file.status === "failed" ? t.failed : t.processing}</p>
              {file.status !== "failed" ? (
                <a href="" className="btn btn-ghost btn-sm mt-4 inline-flex items-center gap-2">
                  <RefreshCw className="size-4" /> {t.refresh}
                </a>
              ) : null}
            </div>
          )}
        </div>

        {file.status === "ready" ? (
          <div className="mt-4 flex justify-end">
            <a href={`${src}?download=1`} className="btn btn-ghost btn-sm text-wine">
              <Download className="size-4" /> {t.download}
            </a>
          </div>
        ) : null}

        <footer className="mt-14 border-t border-line pt-6 text-sm text-muted">
          <p>{t.madeWith}</p>
          <Link href={localizePath("/", locale)} className="mt-1 inline-block text-wine underline decoration-wine/30 underline-offset-4 hover:decoration-wine">
            {t.about}
          </Link>
        </footer>
    </PlainShell>
  );
}
