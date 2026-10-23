import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/class-names";

/**
 * «Назад» на экране уровнем ниже — как в iOS: шеврон и название раздела, цвет акцента. На телефоне занимает одну тонкую
 * строку (зона нажатия 44 pt набрана отрицательными отступами, а не высотой строки), на больших экранах — обычная ссылка.
 */
export function BackLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("-ml-1.5 inline-flex items-center text-sm text-muted hover:text-ink max-lg:-mt-2 max-lg:-mb-1 max-lg:min-h-11 max-lg:text-[15px] max-lg:font-medium max-lg:text-wine", className)}>
      <ChevronLeft className="size-5 shrink-0 lg:size-4" aria-hidden />
      {children}
    </Link>
  );
}
