import { cn } from "@/lib/class-names";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

const TONE: Record<BadgeTone, string> = {
  neutral: "",
  success: "badge-success",
  warning: "badge-warning",
  danger: "badge-danger",
  info: "badge-info",
  accent: "badge-accent",
};

/** Значок статуса (DESIGN.md §6): цвет и текст вместе; dot — точка перед текстом для списков. */
export function Badge({ tone = "neutral", dot, children, className, title }: { tone?: BadgeTone; dot?: boolean; children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span className={cn("badge", TONE[tone], className)} title={title}>
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  );
}
