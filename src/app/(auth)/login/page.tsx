import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { getMessages, lredirect } from "@/i18n/server";
import { getCurrentUser, safeNextPath } from "@/server/auth";
import { registrationOpen } from "@/config/site";
import { isThemeId } from "@/lib/content/themes";
import { LoginForm } from "./LoginForm";

export async function generateMetadata(): Promise<Metadata> {
  // Страница входа не нужна в выдаче: пускаем робота по ссылкам, но не индексируем
  return { title: (await getMessages()).auth.login.meta, robots: { index: false, follow: true } };
}

/** Со входа на регистрацию: ссылка «после входа» на новую книгу (/books/new?theme=…) несёт тему, а регистрация читает именно theme. */
function registerHref(next?: string) {
  if (!next) return "/register";
  const theme = next.startsWith("/books/new?") ? new URLSearchParams(next.slice("/books/new?".length)).get("theme") : null;
  return theme && isThemeId(theme) ? `/register?theme=${theme}` : `/register?next=${encodeURIComponent(next)}`;
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getCurrentUser()) return lredirect(safeNextPath(next));
  const t = (await getMessages()).auth.login;
  return (
    <>
      <h1 className="font-serif text-4xl font-medium">{t.title}</h1>
      <p className="mt-2 mb-8 text-muted">{t.text}</p>
      <LoginForm next={next} />
      {registrationOpen() ? (
        <p className="mt-8 text-center text-sm text-muted">
          {t.noAccount}{" "}
          <Link href={registerHref(next)} className="font-medium text-wine hover:underline">{t.toRegister}</Link>
        </p>
      ) : null}
    </>
  );
}
