import { cn } from "@/lib/class-names";

/**
 * Блоки для заготовок страниц CRM (loading.tsx): повторяют разметку настоящих страниц — шапка, плитки, фильтры, таблица,
 * доска, форма, — чтобы при переходе сразу было видно форму страницы, а содержимое подставлялось на то же место.
 * Только разметка, без состояния: годится и для серверных, и для клиентских файлов.
 */

export const Bar = ({ className }: { className?: string }) => <div className={cn("skeleton h-3.5", className)} />;

/** Корень заготовки: помечен занятым для скринридеров, ширина — как у настоящей страницы. */
export function SkPage({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("sk-delay", !className?.includes("space-y-") && "space-y-6", className)} aria-busy="true" aria-label="Загрузка">
      {children}
    </div>
  );
}

/** Заголовок страницы: ссылка «назад», название, подпись и кнопки справа. */
export function SkHeader({ back, subtitle, actions = 0, title = "w-48" }: { back?: boolean; subtitle?: boolean; actions?: number; title?: string }) {
  return (
    <div>
      {back ? <Bar className="mb-3 h-3 w-20" /> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className={cn("skeleton h-8", title)} />
          {subtitle ? <Bar className="h-3 w-72 max-w-full" /> : null}
        </div>
        {actions ? (
          <div className="flex gap-2">
            {Array.from({ length: actions }, (_, i) => (
              <div key={i} className="skeleton h-9 w-24 rounded-xl" />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Вкладки или «пилюли» фильтров в ряд. */
export function SkTabs({ n = 4, pills }: { n?: number; pills?: boolean }) {
  return (
    <div className={cn("flex gap-2", !pills && "gap-5 border-b border-line pb-2.5")}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className={cn("skeleton h-4", pills ? "h-8 w-24 rounded-full" : "w-20")} />
      ))}
    </div>
  );
}

/** Плитки со значением: подпись и крупное число. */
export function SkStats({ n = 4, className }: { n?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2", n === 6 ? "xl:grid-cols-6" : n === 5 ? "xl:grid-cols-5" : n === 3 ? "xl:grid-cols-3" : "xl:grid-cols-4", className)}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="rounded-2xl border border-line bg-white p-5">
          <Bar className="w-24" />
          <div className="skeleton mt-4 h-7 w-28" />
        </div>
      ))}
    </div>
  );
}

/** Строка фильтров: поля ввода и кнопка. */
export function SkFilters({ fields = 4 }: { fields?: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="skeleton h-10 w-40 rounded-xl" />
      ))}
      <div className="skeleton h-10 w-20 rounded-xl" />
    </div>
  );
}

/** Таблица в карточке: шапка колонок и строки; первая колонка шире (название/клиент). */
export function SkTable({ cols = 5, rows = 8, check }: { cols?: number; rows?: number; check?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="flex items-center gap-4 border-b border-line px-4 py-3.5">
        {check ? <div className="skeleton size-4 rounded" /> : null}
        {Array.from({ length: cols }, (_, i) => (
          <Bar key={i} className={cn("h-3", i === 0 ? "w-40 flex-[2]" : "w-16 flex-1")} />
        ))}
      </div>
      <div className="divide-y divide-line">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex items-center gap-4 px-4 py-4">
            {check ? <div className="skeleton size-4 rounded" /> : null}
            {Array.from({ length: cols }, (_, i) => (
              <div key={i} className={cn("space-y-2", i === 0 ? "flex-[2]" : "flex-1")}>
                <Bar className={i === 0 ? "w-3/4" : "w-2/3"} />
                {i === 0 ? <Bar className="h-3 w-1/2 opacity-70" /> : null}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Карточка с заголовком и строками текста. */
export function SkCard({ lines = 3, title = true, className, children }: { lines?: number; title?: boolean; className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn("rounded-2xl border border-line bg-white p-5", className)}>
      {title ? <div className="skeleton mb-4 h-5 w-40" /> : null}
      {children ?? (
        <div className="space-y-3">
          {Array.from({ length: lines }, (_, i) => (
            <Bar key={i} className={i % 3 === 2 ? "w-1/2" : i % 3 === 1 ? "w-5/6" : "w-full"} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Поле формы: подпись и поле ввода. */
export function SkField({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Bar className="h-3 w-24" />
      <div className="skeleton h-10 w-full rounded-xl" />
    </div>
  );
}

/** Форма в карточке: поля в одну или две колонки и кнопка. */
export function SkForm({ fields = 6, columns = 2, button = true }: { fields?: number; columns?: 1 | 2; button?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <div className={cn("grid gap-4", columns === 2 && "sm:grid-cols-2")}>
        {Array.from({ length: fields }, (_, i) => (
          <SkField key={i} />
        ))}
      </div>
      {button ? <div className="skeleton mt-5 h-10 w-36 rounded-full" /> : null}
    </div>
  );
}

/** Колонки канбана с карточками. */
export function SkBoard({ columns = 4, cards = 3 }: { columns?: number; cards?: number }) {
  return (
    <div className="flex gap-4 overflow-hidden">
      {Array.from({ length: columns }, (_, c) => (
        <div key={c} className="w-72 shrink-0 space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="skeleton h-4 w-28" />
            <Bar className="h-3 w-8" />
          </div>
          {Array.from({ length: Math.max(1, cards - (c % 2)) }, (_, i) => (
            <div key={i} className="space-y-2.5 rounded-xl border border-line bg-white p-3.5">
              <Bar className="w-4/5" />
              <Bar className="h-3 w-2/3" />
              <div className="flex gap-2 pt-1">
                <div className="skeleton h-5 w-14 rounded-md" />
                <div className="skeleton h-5 w-10 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Столбчатый график в карточке. */
export function SkChart({ title = true, className }: { title?: boolean; className?: string }) {
  const heights = [30, 55, 40, 70, 45, 85, 60, 35, 75, 50, 65, 90];
  return (
    <div className={cn("rounded-2xl border border-line bg-white p-5", className)}>
      {title ? <div className="skeleton mb-5 h-5 w-40" /> : null}
      <div className="flex h-44 items-end gap-2">
        {heights.map((h, i) => (
          <div key={i} className="skeleton flex-1 rounded-t-md rounded-b-none" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

/** Список строк в карточке: значок/аватар слева, две строки текста, действие справа. */
export function SkRows({ rows = 6, avatar, action = true }: { rows?: number; avatar?: boolean; action?: boolean }) {
  return (
    <div className="divide-y divide-line rounded-2xl border border-line bg-white">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          {avatar ? <div className="skeleton size-10 shrink-0 rounded-full" /> : null}
          <div className="min-w-0 flex-1 space-y-2">
            <Bar className="w-1/2" />
            <Bar className="h-3 w-1/3 opacity-70" />
          </div>
          {action ? <div className="skeleton h-8 w-20 rounded-lg" /> : null}
        </div>
      ))}
    </div>
  );
}

/** Две колонки: основная и боковая — карточки сделки, заказа, клиента. */
export function SkTwoCol({ main, side, sideWidth = "22rem" }: { main: React.ReactNode; side: React.ReactNode; sideWidth?: string }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_var(--side)]" style={{ "--side": sideWidth } as React.CSSProperties}>
      <div className="min-w-0 space-y-6">{main}</div>
      <div className="min-w-0 space-y-6">{side}</div>
    </div>
  );
}
