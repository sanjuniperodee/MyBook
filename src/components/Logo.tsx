import Image from "next/image";
import { Link } from "@/i18n/client";
import { site } from "@/config/site";
import { cn } from "@/lib/utils";

/** Знак логотипа: буква M с пером над раскрытой книгой на бордовом фоне. Готовые лёгкие WebP отдаются как есть: оптимизатор next/image после каждого деплоя начинал с пустого кэша. */
export function LogoMark({ className }: { className?: string }) {
  return <Image src="/mark.webp" alt="" width={144} height={144} unoptimized className={cn("size-9 rounded-[10px]", className)} aria-hidden />;
}

/** Основной логотип целиком (знак + надпись MYBOOKS), для крупных мест. */
export function LogoFull({ className }: { className?: string }) {
  return <Image src="/logo.webp" alt={site.name} width={438} height={312} unoptimized className={cn("h-24 w-auto rounded-xl", className)} />;
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
