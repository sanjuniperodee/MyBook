"use client";

import { Link } from "@/i18n/client";
import { track } from "@/lib/analytics-client";

/**
 * Кнопка посадочной, которая отправляет цель в счётчики: WhatsApp — «contact» (Contact в Meta Pixel),
 * переход к написанию книги — «lead». place — где нажали, чтобы сравнивать кнопки в отчётах.
 */
export function TrackedLink({
  href,
  goal,
  place,
  className,
  children,
}: {
  href: string;
  goal: "contact" | "lead";
  place: string;
  className?: string;
  children: React.ReactNode;
}) {
  const onClick = () => track(goal, undefined, { place });
  if (href.startsWith("http")) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} onClick={onClick} className={className}>
      {children}
    </Link>
  );
}
