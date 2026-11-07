"use client";

import { useLinkStatus } from "next/link";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/class-names";

/**
 * Значок внутри ссылки, который на время перехода сменяется кольцом загрузки. Переходы в книгу ждут готовую страницу
 * (без заготовки — иначе обложке не к чему «перетечь»), поэтому нажатие должно сразу показывать, что дело идёт.
 * Значок передаётся содержимым: компоненты-функции из серверной разметки в клиентскую не передаются.
 */
export function LinkPending({ children, className }: { children: React.ReactNode; className?: string }) {
  const { pending } = useLinkStatus();
  return pending ? <LoaderCircle className={cn("size-[18px] animate-spin", className)} aria-hidden /> : <>{children}</>;
}
