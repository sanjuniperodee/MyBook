"use client";

import { ChevronLeft } from "lucide-react";
import { Link, useMessages } from "@/i18n/client";

export function BackLink({ href, children }: { href: string; children?: React.ReactNode }) {
  const m = useMessages().common;
  return (
    <Link href={href} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-white pr-4 pl-3 text-sm font-medium shadow-soft transition hover:border-ink/30">
      <ChevronLeft className="size-4" /> {children ?? m.actions.toHome}
    </Link>
  );
}
