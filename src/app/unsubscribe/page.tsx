import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { unsubscribe, verifyUnsubscribe } from "@/lib/lifecycle";

export const metadata: Metadata = { title: "Отписка от писем", robots: { index: false } };

async function unsubscribeAction(form: FormData) {
  "use server";
  const u = String(form.get("u") ?? "");
  const t = String(form.get("t") ?? "");
  if (/^[0-9a-f-]{36}$/i.test(u) && verifyUnsubscribe(u, t)) await unsubscribe(u);
  const { redirect } = await import("next/navigation");
  redirect("/unsubscribe?done=1");
}

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ u?: string; t?: string; done?: string }> }) {
  const { u = "", t = "", done } = await searchParams;
  const valid = /^[0-9a-f-]{36}$/i.test(u) && verifyUnsubscribe(u, t);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <Logo />
      {done ? (
        <>
          <h1 className="mt-10 font-serif text-4xl font-medium">Готово</h1>
          <p className="mt-3 text-ink-soft">Больше не будем присылать напоминания и советы. Письма о ваших заказах по-прежнему будут приходить.</p>
        </>
      ) : valid ? (
        <>
          <h1 className="mt-10 font-serif text-4xl font-medium">Отписаться от писем?</h1>
          <p className="mt-3 text-ink-soft">Мы пишем редко: советы, как начать книгу, и напоминания, чтобы она успела к празднику.</p>
          <form action={unsubscribeAction} className="mt-8">
            <input type="hidden" name="u" value={u} />
            <input type="hidden" name="t" value={t} />
            <button className="btn btn-outline">Да, отписаться</button>
          </form>
        </>
      ) : (
        <>
          <h1 className="mt-10 font-serif text-4xl font-medium">Ссылка устарела</h1>
          <p className="mt-3 text-ink-soft">Напишите нам — отпишем вручную.</p>
        </>
      )}
      <Link href="/" className="mt-10 text-sm text-muted underline">На главную</Link>
    </main>
  );
}
