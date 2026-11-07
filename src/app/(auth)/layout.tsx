import { Logo } from "@/components/Logo";
import { Book3D } from "@/components/cover/Book3D";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { getMessages } from "@/i18n/server";

/**
 * Вход и регистрация: два столбца. Слева — форма (на телефоне только она), справа — «кадр фильма»: тёмный корешок, книга
 * и тонкая рамка кадра, под ней строка о том, зачем всё это. Без свечения и покачивания: кадр неподвижен, форма — главное.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = (await getMessages()).auth.layout;
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-10 sm:pt-6">
        <div className="flex min-h-11 items-center justify-between gap-4">
          <Logo className="max-sm:[&>span]:text-xl" />
          <LanguageSwitch />
        </div>
        <main className="flex flex-1 items-start justify-center pt-10 pb-6 sm:items-center sm:py-10">
          <div className="enter w-full max-w-[400px]">{children}</div>
        </main>
      </div>
      <div className="relative hidden overflow-hidden bg-spine lg:flex lg:items-center lg:justify-center" aria-hidden>
        <div className="pointer-events-none absolute inset-6 border border-white/15" />
        <div className="pointer-events-none absolute inset-8 border border-white/[0.07]" />
        <div className="enter relative w-[44%] max-w-[330px]" style={{ "--i": 2 } as React.CSSProperties}>
          <Book3D template="peony" title={t.book.title} subtitle={t.book.subtitle} names={t.book.names} rotate={20} />
        </div>
        <p style={{ "--i": 4 } as React.CSSProperties} className="enter absolute bottom-16 max-w-sm px-6 text-center font-serif text-2xl leading-snug text-white/85 italic">
          {t.quote}
        </p>
      </div>
    </div>
  );
}
