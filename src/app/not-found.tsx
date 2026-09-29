import Link from "next/link";
import { Logo } from "@/components/Logo";
import { LostPageArt } from "@/components/illustrations";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-16 text-center">
      <Logo />
      <LostPageArt className="enter mt-10 h-48 w-auto sm:h-56" />
      <div style={{ "--i": 1 } as React.CSSProperties} className="enter mt-2 font-serif text-sm tracking-[0.3em] text-wine uppercase">
        Ошибка 404
      </div>
      <h1 style={{ "--i": 2 } as React.CSSProperties} className="enter mt-3 font-serif text-4xl font-medium sm:text-5xl">
        Эта страница потерялась
      </h1>
      <p style={{ "--i": 3 } as React.CSSProperties} className="enter mt-3 max-w-md text-muted">
        Возможно, ссылка устарела или в адресе опечатка. Ваши книги и ответы на месте.
      </p>
      <div style={{ "--i": 4 } as React.CSSProperties} className="enter mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className="btn btn-outline">
          На главную
        </Link>
        <Link href="/books" className="btn btn-primary">
          Мои книги
        </Link>
      </div>
    </main>
  );
}
