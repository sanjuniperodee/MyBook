import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function BackLink({ href, children = "На главную" }: { href: string; children?: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-white pr-4 pl-3 text-sm font-medium shadow-soft transition hover:border-ink/30">
      <ChevronLeft className="size-4" /> {children}
    </Link>
  );
}
