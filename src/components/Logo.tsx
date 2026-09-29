import Link from "next/link";
import { site } from "@/config/site";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-8", className)} aria-hidden>
      <rect width="64" height="64" rx="14" fill="#7a1f2b" />
      <path d="M18 18h10c2.2 0 4 1.8 4 4v24c0-2.2-1.8-4-4-4H18z" fill="#faf7f2" />
      <path d="M46 18H36c-2.2 0-4 1.8-4 4v24c0-2.2 1.8-4 4-4h10z" fill="#f3d9d4" />
    </svg>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2.5 font-semibold tracking-tight", className)}>
      <LogoMark />
      <span className="font-serif text-2xl font-semibold leading-none">{site.name}</span>
    </Link>
  );
}
