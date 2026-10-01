import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

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

/** Карточка-вариант с галочкой у выбранного. */
export function Choice({ active, onClick, children, disabled }: { active: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn("relative rounded-2xl border bg-white p-5 text-left transition", active ? "border-wine ring-4 ring-wine/10" : "border-line hover:border-ink/30")}
    >
      {active ? (
        <span className="absolute top-3 right-3 flex size-6 items-center justify-center rounded-full bg-wine text-white">
          <Check className="size-3.5" />
        </span>
      ) : null}
      {children}
    </button>
  );
}
