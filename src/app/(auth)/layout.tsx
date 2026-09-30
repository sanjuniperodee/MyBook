import { Logo } from "@/components/Logo";
import { Book3D } from "@/components/cover/Book3D";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { getMessages } from "@/i18n/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = (await getMessages()).auth.layout;
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <div className="flex items-center justify-between gap-4">
          <Logo />
          <LanguageSwitch />
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="enter w-full max-w-[400px]">{children}</div>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-[#2a1a1f] lg:flex lg:items-center lg:justify-center">
        <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_40%,rgba(233,166,174,.25),transparent)]" />
        <div className="enter relative w-[46%] max-w-[340px]" style={{ "--i": 2 } as React.CSSProperties}>
          <div className="animate-float">
          <Book3D template="blossom" title={t.book.title} subtitle={t.book.subtitle} names={t.book.names} rotate={-20} />
          </div>
        </div>
        <p style={{ "--i": 4 } as React.CSSProperties} className="enter absolute bottom-10 max-w-sm px-6 text-center font-serif text-2xl leading-snug text-[#f4dcd6]/90 italic">
          {t.quote}
        </p>
      </div>
    </div>
  );
}
