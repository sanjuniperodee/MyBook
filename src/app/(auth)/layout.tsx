import { Logo } from "@/components/Logo";
import { Book3D } from "@/components/cover/Book3D";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <Logo />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="enter w-full max-w-[400px]">{children}</div>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-[#2a1a1f] lg:flex lg:items-center lg:justify-center">
        <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_40%,rgba(233,166,174,.25),transparent)]" />
        <div className="enter relative w-[46%] max-w-[340px]" style={{ "--i": 2 } as React.CSSProperties}>
          <div className="animate-float">
          <Book3D template="blossom" title="Ты — моё всё" subtitle="Четыре года вместе" names="Алия & Марғұлан" rotate={-20} />
          </div>
        </div>
        <p style={{ "--i": 4 } as React.CSSProperties} className="enter absolute bottom-10 max-w-sm px-6 text-center font-serif text-2xl leading-snug text-[#f4dcd6]/90 italic">
          «Слова, сказанные вслух, забываются. Написанные — остаются навсегда.»
        </p>
      </div>
    </div>
  );
}
