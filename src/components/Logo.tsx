import Image from "next/image";
import Link from "next/link";
import { site } from "@/config/site";
import { cn } from "@/lib/utils";

/** Знак логотипа: буква M с пером над раскрытой книгой на бордовом фоне. */
export function LogoMark({ className }: { className?: string }) {
  return <Image src="/mark.png" alt="" width={512} height={512} className={cn("size-9 rounded-[10px]", className)} aria-hidden />;
}

/** Основной логотип целиком (знак + надпись MYBOOKS), для крупных мест. */
export function LogoFull({ className }: { className?: string }) {
  return <Image src="/logo.png" alt={site.name} width={438} height={312} className={cn("h-24 w-auto rounded-xl", className)} />;
}

/**
 * `compact` — знак и название в одну строку (шапки), `full` — логотип целиком (футер, вход, письма).
 */
export function Logo({ href = "/", className, variant = "compact" }: { href?: string; className?: string; variant?: "compact" | "full" }) {
  return (
    <Link href={href} aria-label={site.name} className={cn("inline-flex items-center gap-2.5 font-semibold tracking-tight", className)}>
      {variant === "full" ? (
        <LogoFull />
      ) : (
        <>
          <LogoMark />
          <span className="font-serif text-2xl leading-none font-semibold tracking-wide uppercase">{site.name}</span>
        </>
      )}
    </Link>
  );
}
