/** Заготовка «Дублей сделок»: группы со сделками рядом. */
import { SkHeader, SkPage } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="mx-auto w-full max-w-5xl space-y-5">
      <SkHeader back title="w-44" subtitle />
      {Array.from({ length: 2 }, (_, g) => (
        <div key={g} className="overflow-hidden rounded-[var(--r-panel)] border border-line bg-white">
          <div className="border-b border-line px-5 py-3.5">
            <div className="skeleton h-5 w-40" />
          </div>
          <div className="grid gap-px bg-line sm:grid-cols-2">
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="space-y-3 bg-white p-4">
                <div className="skeleton h-5 w-3/4" />
                {Array.from({ length: 5 }, (_, r) => (
                  <div key={r} className="skeleton h-3.5 w-full" />
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </SkPage>
  );
}
