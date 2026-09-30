import { Logo } from "@/components/Logo";
import { LostPageArt } from "@/components/illustrations";
import { Link } from "@/i18n/client";
import { getMessages } from "@/i18n/server";

export default async function NotFound() {
  const { common: m } = await getMessages();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-16 text-center">
      <Logo />
      <LostPageArt className="enter mt-10 h-48 w-auto sm:h-56" label={m.notFound.art} />
      <div style={{ "--i": 1 } as React.CSSProperties} className="enter mt-2 font-serif text-sm tracking-[0.3em] text-wine uppercase">
        {m.notFound.code}
      </div>
      <h1 style={{ "--i": 2 } as React.CSSProperties} className="enter mt-3 font-serif text-4xl font-medium sm:text-5xl">
        {m.notFound.title}
      </h1>
      <p style={{ "--i": 3 } as React.CSSProperties} className="enter mt-3 max-w-md text-muted">
        {m.notFound.text}
      </p>
      <div style={{ "--i": 4 } as React.CSSProperties} className="enter mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className="btn btn-outline">
          {m.actions.toHome}
        </Link>
        <Link href="/books" className="btn btn-primary">
          {m.actions.toMyBooks}
        </Link>
      </div>
    </main>
  );
}
