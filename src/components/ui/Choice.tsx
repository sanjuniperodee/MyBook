import { Check } from "lucide-react";
import { cn } from "@/lib/class-names";

/** Раздел страницы настроек книги: заголовок, пояснение и содержимое. */
export function FormSection({ id, title, description, children }: { id?: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28">
      <h2 className="text-xl font-semibold">{title}</h2>
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * Вариант выбора: переключатель слева (кружок, у выбранного — с галочкой), название и пояснение справа. Переключатель стоит
 * в потоке, а не поверх текста, поэтому в узкой панели ничего не перекрывается; сетка вариантов сама решает, сколько их в ряд
 * (grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr))).
 */
export function Choice({ active, onClick, children, disabled }: { active: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "flex min-w-0 items-start gap-3 rounded-[var(--r-panel)] border p-3.5 text-left transition-colors disabled:opacity-60",
        active ? "border-wine bg-rose/50" : "border-line bg-white hover:border-line-strong hover:bg-sunken/50",
      )}
    >
      <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors", active ? "border-wine bg-wine text-white" : "border-line-strong bg-white")} aria-hidden>
        {active ? <Check className="size-3" strokeWidth={3} /> : null}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}
