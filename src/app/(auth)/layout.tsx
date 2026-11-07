import { Logo } from "@/components/Logo";
import { Book3D } from "@/components/cover/Book3D";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { getMessages } from "@/i18n/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = (await getMessages()).auth.layout;
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-10 sm:pt-6">
        <div className="flex min-h-11 items-center justify-between gap-4">
          <Logo className="max-sm:[&>span]:text-xl" />
          <LanguageSwitch />
        </div>
        <main className="flex flex-1 items-start justify-center pt-10 pb-6 sm:items-center sm:py-10">
          <div className="enter w-full max-w-[400px]">{children}</div>
        </main>
      </div>
      {/* «Кадр фильма»: тёмный корешок, книга в луче света и тонкая рамка кадра. */}
      <div className="relative hidden overflow-hidden bg-spine lg:flex lg:items-center lg:justify-center" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_40%,rgb(201_75_95/0.28),transparent)]" />
        <div className="pointer-events-none absolute inset-6 border border-white/15" />
        <div className="enter relative w-[46%] max-w-[340px]" style={{ "--i": 2 } as React.CSSProperties}>
          <div className="animate-float">
          <Book3D template="peony" title={t.book.title} subtitle={t.book.subtitle} names={t.book.names} rotate={20} />
          </div>
        </div>
        <p style={{ "--i": 4 } as React.CSSProperties} className="enter absolute bottom-14 max-w-sm px-6 text-center font-serif text-2xl leading-snug text-white/85 italic">
          {t.quote}
        </p>
      </div>
    </div>
  );
}
