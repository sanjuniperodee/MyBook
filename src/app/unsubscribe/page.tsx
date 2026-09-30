import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { Logo } from "@/components/Logo";
import { getMessages, lredirect } from "@/i18n/server";
import { unsubscribe, verifyUnsubscribe } from "@/lib/lifecycle";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).gift.unsubscribe.meta, robots: { index: false } };
}

async function unsubscribeAction(form: FormData) {
  "use server";
  const u = String(form.get("u") ?? "");
  const t = String(form.get("t") ?? "");
  if (/^[0-9a-f-]{36}$/i.test(u) && verifyUnsubscribe(u, t)) await unsubscribe(u);
  return lredirect("/unsubscribe?done=1");
}

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ u?: string; t?: string; done?: string }> }) {
  const { u = "", t = "", done } = await searchParams;
  const valid = /^[0-9a-f-]{36}$/i.test(u) && verifyUnsubscribe(u, t);
  const m = (await getMessages()).gift.unsubscribe;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <Logo />
      {done ? (
        <>
          <h1 className="mt-10 font-serif text-4xl font-medium">{m.done}</h1>
          <p className="mt-3 text-ink-soft">{m.doneText}</p>
        </>
      ) : valid ? (
        <>
          <h1 className="mt-10 font-serif text-4xl font-medium">{m.confirm}</h1>
          <p className="mt-3 text-ink-soft">{m.confirmText}</p>
          <form action={unsubscribeAction} className="mt-8">
            <input type="hidden" name="u" value={u} />
            <input type="hidden" name="t" value={t} />
            <button className="btn btn-outline">{m.yes}</button>
          </form>
        </>
      ) : (
        <>
          <h1 className="mt-10 font-serif text-4xl font-medium">{m.expired}</h1>
          <p className="mt-3 text-ink-soft">{m.expiredText}</p>
        </>
      )}
      <Link href="/" className="mt-10 text-sm text-muted underline">{m.home}</Link>
    </main>
  );
}
