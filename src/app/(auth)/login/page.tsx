import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, safeNextPath } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Вход" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect(safeNextPath(next));
  return (
    <>
      <h1 className="font-serif text-4xl font-medium">С возвращением</h1>
      <p className="mt-2 mb-8 text-muted">Войдите, чтобы продолжить писать свою книгу.</p>
      <LoginForm next={next} />
      <p className="mt-8 text-center text-sm text-muted">
        Ещё нет аккаунта?{" "}
        <Link href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"} className="font-medium text-wine hover:underline">Зарегистрироваться</Link>
      </p>
    </>
  );
}
