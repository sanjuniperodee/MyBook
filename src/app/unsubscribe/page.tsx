import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { PlainSheet, PlainShell } from "@/components/landing/PlainShell";
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
  const title = done ? m.done : valid ? m.confirm : m.expired;
  const text = done ? m.doneText : valid ? m.confirmText : m.expiredText;
  return (
    <PlainShell lang={false} size="sm" className="pt-10 sm:pt-16">
      <PlainSheet className="sm:p-12">
        <h1 className="font-serif text-[38px] leading-[1.05] font-medium text-balance sm:text-5xl">{title}</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-soft">{text}</p>
        {!done && valid ? (
          <form action={unsubscribeAction} className="mt-8">
            <input type="hidden" name="u" value={u} />
            <input type="hidden" name="t" value={t} />
            <button className="btn btn-primary btn-lg w-full sm:w-auto">{m.yes}</button>
          </form>
        ) : null}
        <Link href="/" className="mt-8 inline-flex min-h-11 items-center text-sm text-muted underline underline-offset-4 hover:text-ink">
          {m.home}
        </Link>
      </PlainSheet>
    </PlainShell>
  );
}
