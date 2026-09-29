import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowRight, Camera, Check, Eye, MessageCircle, Palette, PenLine, SlidersHorizontal, Truck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getAccessibleBook, getBookPhotos, getBookQuestions, getBookStats } from "@/lib/books";
import { chapterTitle, getTheme } from "@/lib/content/themes";
import { applyGender } from "@/lib/content/gender";
import { Book3D } from "@/components/cover/Book3D";
import { coverNamesLine, getCoverTemplate } from "@/lib/book/covers";
import { photoUrl } from "@/lib/urls";
import { pluralRu } from "@/lib/book/layout";
import { getFormat, print } from "@/lib/book/formats";
import { getTypography } from "@/lib/book/fonts";
import { site } from "@/config/site";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { orderStatusLabel } from "@/lib/orders-shared";
import { cn } from "@/lib/utils";
import { BookMenu } from "./BookMenu";

export const metadata: Metadata = { title: "Книга" };

export default async function BookHubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/books/${id}`);
  const book = await getAccessibleBook(id, user);
  const [stats, questions, photos, [order]] = await Promise.all([
    getBookStats(book),
    getBookQuestions(book.id),
    getBookPhotos(book.id),
    db.select().from(orders).where(eq(orders.bookId, book.id)).orderBy(desc(orders.createdAt)).limit(1),
  ]);
  const theme = getTheme(book.theme);
  const g = (s: string) => applyGender(s, book.authorGender, book.recipientGender);
  const editable = book.status === "draft";
  const percent = stats.total ? Math.round((stats.answered / stats.total) * 100) : 0;
  const base = `/books/${book.id}`;

  // Прогресс по главам
  const chapters: { key: string; title: string; total: number; answered: number; firstOpen: number; first: number }[] = [];
  questions.forEach((q, i) => {
    let ch = chapters[chapters.length - 1];
    if (!ch || ch.key !== q.chapter) {
      ch = { key: q.chapter, title: g(chapterTitle(theme, q.chapter)), total: 0, answered: 0, firstOpen: -1, first: i };
      chapters.push(ch);
    }
    ch.total++;
    if (q.answer.trim()) ch.answered++;
    else if (ch.firstOpen === -1) ch.firstOpen = i;
  });
  const nextIndex = questions.findIndex((q) => !q.answer.trim());
  const next = nextIndex >= 0 ? questions[nextIndex] : null;
  const nextChapter = next ? chapters.find((c) => c.key === next.chapter) : null;

  const steps = [
    { icon: PenLine, title: "Текст", value: `${stats.answered} ${pluralRu(stats.answered, "ответ", "ответа", "ответов")}`, done: stats.answered >= 10, href: `${base}/questions` },
    { icon: Palette, title: "Обложка", value: getCoverTemplate(book.coverTemplate).name, done: true, href: `${base}/cover` },
    { icon: Camera, title: "Фотографии", value: photos.length ? `${photos.length} фото` : "не добавлены", done: photos.length > 0, href: `${base}/photos` },
    { icon: SlidersHorizontal, title: "Оформление", value: `${getFormat(book.format).short} · ${getTypography(book.typography).name}`, done: true, href: `${base}/settings` },
    { icon: Eye, title: "Проверка макета", value: "PDF всех страниц", done: false, href: `${base}/preview` },
    {
      icon: Truck,
      title: "Заказ и печать",
      value: order ? orderStatusLabel(order.status) : "после проверки",
      done: !!order && order.status !== "pending_payment" && order.status !== "cancelled",
      href: order ? `/orders/${order.id}` : `${base}/checkout`,
    },
  ];

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Книга */}
      <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:gap-16">
        <div className="mx-auto w-full max-w-[260px] lg:max-w-[300px]">
          <Book3D
            template={book.coverTemplate}
            format={book.format}
            title={book.title}
            subtitle={book.subtitle}
            names={coverNamesLine(book.authorName, book.recipientName, book.hideRecipientOnCover)}
            photoUrl={book.coverPhotoId ? photoUrl(book.coverPhotoId, "full") : undefined}
            rotate={-18}
            thickness={Math.min(14, 4 + stats.printedPages / 20)}
          />
        </div>
        <div>
          <div className="eyebrow">{editable ? "Книга пишется" : "Книга в работе"}</div>
          <h1 className="mt-3 font-serif text-4xl leading-[1.05] font-medium sm:text-6xl">{book.title}</h1>
          {book.subtitle ? <p className="mt-2 font-serif text-xl text-muted italic">{book.subtitle}</p> : null}

          <dl className="mt-8 grid max-w-xl grid-cols-4 divide-x divide-line">
            {[
              [stats.printedPages, pluralRu(stats.printedPages, "страница", "страницы", "страниц")],
              [stats.answered, pluralRu(stats.answered, "ответ", "ответа", "ответов")],
              [stats.words, pluralRu(stats.words, "слово", "слова", "слов")],
              [stats.photos, "фото"],
            ].map(([v, l], i) => (
              <div key={i} className={cn("px-4 first:pl-0")}>
                <dt className="sr-only">{l}</dt>
                <dd className="font-serif text-3xl font-medium tabular-nums sm:text-4xl">{Number(v).toLocaleString("ru-RU")}</dd>
                <div className="text-xs text-muted sm:text-sm">{l}</div>
              </div>
            ))}
          </dl>

          <div className="mt-6 max-w-xl">
            <div className="flex justify-between text-xs text-muted">
              <span>Отвечено на {percent}% вопросов</span>
              {stats.estimatedPages < print.minPages ? <span>печатная книга — от {print.minPages} стр.</span> : null}
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-cream">
              <div className="h-full rounded-full bg-wine" style={{ width: `${Math.max(percent, 1.5)}%` }} />
            </div>
          </div>

          {editable && next ? (
            <Link href={`${base}/questions?q=${nextIndex + 1}`} className="group mt-8 flex max-w-xl items-center gap-5 rounded-3xl bg-ink p-5 text-white transition hover:bg-ink-soft sm:p-6">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-white/50">
                  {stats.answered ? "Следующий вопрос" : "Первый вопрос"} · {nextChapter?.title}
                </div>
                <div className="mt-1.5 line-clamp-2 font-serif text-xl leading-snug sm:text-2xl">{g(next.prompt)}</div>
              </div>
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white text-ink transition group-hover:translate-x-1">
                <ArrowRight className="size-5" />
              </span>
            </Link>
          ) : null}
          {!editable ? (
            <p className="mt-8 max-w-xl rounded-2xl bg-cream/70 p-4 text-sm text-ink-soft">
              Книга передана в печать, поэтому редактирование закрыто. Если нужно что-то поправить — напишите в поддержку, мы откроем доступ.
            </p>
          ) : null}
        </div>
      </section>

      <section className="mt-16 grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* Главы */}
        <div>
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-3xl font-medium">Главы</h2>
            <span className="text-sm text-muted">
              {chapters.filter((c) => c.answered > 0).length} из {chapters.length} начаты
            </span>
          </div>
          <ol className="mt-5 divide-y divide-line border-y border-line">
            {chapters.map((c, i) => {
              const done = c.answered === c.total;
              const target = (c.firstOpen >= 0 ? c.firstOpen : c.first) + 1;
              return (
                <li key={c.key}>
                  <Link href={`${base}/questions?q=${target}`} className="group flex items-center gap-4 py-3.5">
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums",
                        done ? "bg-wine text-white" : c.answered ? "bg-rose text-wine" : "bg-cream text-muted",
                      )}
                    >
                      {done ? <Check className="size-4" /> : i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium group-hover:text-wine">{c.title}</span>
                      <span className="mt-1.5 block h-1 max-w-56 overflow-hidden rounded-full bg-cream">
                        <span className="block h-full rounded-full bg-wine/70" style={{ width: `${(c.answered / c.total) * 100}%` }} />
                      </span>
                    </span>
                    <span className="text-sm text-muted tabular-nums">
                      {c.answered}/{c.total}
                    </span>
                    <ArrowRight className="size-4 text-muted opacity-0 transition group-hover:opacity-100" />
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Путь к книге */}
        <aside className="space-y-6">
          <div className="card p-6">
            <h2 className="font-semibold">Путь к готовой книге</h2>
            <ol className="relative mt-5 space-y-1">
              {steps.map((s) => (
                <li key={s.title}>
                  <Link href={s.href} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 transition hover:bg-cream/60">
                    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", s.done ? "bg-emerald-50 text-emerald-700" : "bg-cream text-ink-soft")}>
                      {s.done ? <Check className="size-4" /> : <s.icon className="size-4" strokeWidth={1.8} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{s.title}</span>
                      <span className="block truncate text-xs text-muted">{s.value}</span>
                    </span>
                    <ArrowRight className="size-4 text-muted" />
                  </Link>
                </li>
              ))}
            </ol>
          </div>

          {photos.length ? (
            <Link href={`${base}/photos`} className="card block overflow-hidden">
              <div className="grid grid-cols-4 gap-0.5">
                {photos.slice(0, 8).map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={p.id} src={photoUrl(p.id)} alt="" className="aspect-square w-full object-cover" />
                ))}
              </div>
              <div className="px-5 py-3 text-sm text-muted">{photos.length} фото в книге · управлять</div>
            </Link>
          ) : null}

          <div className="flex items-center justify-between gap-3 rounded-3xl border border-line p-5">
            <a href={site.contacts.whatsapp} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm">
              <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <MessageCircle className="size-4" />
              </span>
              <span>
                <span className="block font-medium">Нужна помощь?</span>
                <span className="text-muted">Напишите нам в WhatsApp</span>
              </span>
            </a>
            <BookMenu bookId={book.id} editable={editable} />
          </div>
        </aside>
      </section>
    </main>
  );
}
