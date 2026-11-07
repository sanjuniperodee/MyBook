import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/client";
import { cn } from "@/lib/class-names";

/** Видимые хлебные крошки (разметка BreadcrumbList для поисковиков — отдельно, в lib/seo). `dark` — поверх «кадра». */
export function Breadcrumbs({ items, tone = "light", className }: { items: { name: string; href?: string }[]; tone?: "light" | "dark"; className?: string }) {
  return (
    <nav aria-label="breadcrumb" className={cn("mb-6", className)}>
      <ol className={cn("flex flex-wrap items-center gap-1 text-sm", tone === "dark" ? "text-white/70" : "text-muted")}>
        {items.map((it, i) => (
          <li key={it.name} className="flex items-center gap-1">
            {i > 0 ? <ChevronRight className="size-3.5" aria-hidden /> : null}
            {it.href ? (
              <Link href={it.href} className={tone === "dark" ? "hover:text-white" : "hover:text-ink"}>
                {it.name}
              </Link>
            ) : (
              <span aria-current="page" className={tone === "dark" ? "text-white/90" : "text-ink-soft"}>
                {it.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
