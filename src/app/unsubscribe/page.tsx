import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { PlainShell } from "@/components/landing/PlainShell";
import { getMessages, lredirect } from "@/i18n/server";
import { container } from "@/server/container";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).gift.unsubscribe.meta, robots: { index: false } };
}

async function unsubscribeAction(form: FormData) {
  "use server";
  const u = String(form.get("u") ?? "");
  const t = String(form.get("t") ?? "");
  await container().notifications.subscriptions.unsubscribe(u, t);
  return lredirect("/unsubscribe?done=1");
}

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ u?: string; t?: string; done?: string }> }) {
  const { u = "", t = "", done } = await searchParams;
  const valid = container().notifications.subscriptions.isValidLink(u, t);
  const m = (await getMessages()).gift.unsubscribe;
  return (
    <PlainShell lang={false} className="max-w-xl text-center">
      <div className="py-10 sm:py-16">
        {done ? (
          <>
            <h1 className="font-serif text-4xl leading-tight font-medium text-balance sm:text-5xl">{m.done}</h1>
            <p className="mt-4 text-ink-soft">{m.doneText}</p>
          </>
        ) : valid ? (
          <>
            <h1 className="font-serif text-4xl leading-tight font-medium text-balance sm:text-5xl">{m.confirm}</h1>
            <p className="mt-4 text-ink-soft">{m.confirmText}</p>
            <form action={unsubscribeAction} className="mt-8">
              <input type="hidden" name="u" value={u} />
              <input type="hidden" name="t" value={t} />
              <button className="btn btn-outline btn-lg">{m.yes}</button>
            </form>
          </>
        ) : (
          <>
            <h1 className="font-serif text-4xl leading-tight font-medium text-balance sm:text-5xl">{m.expired}</h1>
            <p className="mt-4 text-ink-soft">{m.expiredText}</p>
          </>
        )}
        <Link href="/" className="mt-10 inline-block text-sm text-muted underline underline-offset-4 hover:text-ink">
          {m.home}
        </Link>
      </div>
    </PlainShell>
  );
}
