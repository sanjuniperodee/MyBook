import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <Logo variant="full" />
      <div className="mt-12 font-serif text-8xl text-wine">404</div>
      <h1 className="mt-4 font-serif text-3xl">Такой страницы нет</h1>
      <p className="mt-3 max-w-md text-muted">Возможно, ссылка устарела. Вернитесь на главную или к своим книгам.</p>
      <div className="mt-8 flex gap-3">
        <Link href="/" className="btn btn-outline">На главную</Link>
        <Link href="/books" className="btn btn-primary">Мои книги</Link>
      </div>
    </main>
  );
}
