import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { RegisterForm } from "./RegisterForm";

export const metadata: Metadata = { title: "Регистрация" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ theme?: string }> }) {
  const { theme } = await searchParams;
  if (await getCurrentUser()) redirect(theme ? `/books/new?theme=${encodeURIComponent(theme)}` : "/books");
  return (
    <>
      <h1 className="font-serif text-4xl font-medium">Начнём вашу книгу</h1>
      <p className="mt-2 mb-8 text-muted">Писать можно бесплатно. Платите только когда книга готова к печати.</p>
      <RegisterForm theme={theme} />
      <p className="mt-8 text-center text-sm text-muted">
        Уже есть аккаунт? <Link href="/login" className="font-medium text-wine hover:underline">Войти</Link>
      </p>
    </>
  );
}
