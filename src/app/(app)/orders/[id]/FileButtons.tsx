"use client";

import { Download, LoaderCircle } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { cn } from "@/lib/class-names";
import { prepareAndDownload, RenderStatus, useRenderJob } from "@/components/ui/RenderProgress";
import { Alert } from "@/components/ui/Alert";

/**
 * Файлы книги после оплаты. Первое скачивание собирает PDF (до минуты): кнопка ждёт сборку и показывает её ход —
 * этап, проценты и сколько осталось; готовый файл скачивается сразу.
 */
export function FileButtons({ orderId, printed }: { orderId: string; printed: boolean }) {
  const t = useMessages().orders.order;
  const { busy, job, error, run, waiting } = useRenderJob(orderId, t.progress.failed);
  const file = (id: string, kind: string, label: string, className: string, download = true) => {
    const href = `/api/orders/${orderId}/files/${kind}`;
    return (
      <a
        key={id}
        href={href}
        aria-disabled={busy !== null}
        className={cn(className, busy !== null && busy !== id && "pointer-events-none opacity-50")}
        onClick={(e) => {
          // Ctrl/⌘-клик и средняя кнопка — как у обычной ссылки.
          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          void run(id, [kind === "reading" ? "reading" : "package"], () => prepareAndDownload(orderId, kind, href));
        }}
      >
        {download ? busy === id ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" /> : null} {label}
      </a>
    );
  };
  return (
    <>
      <div className="mt-5 flex flex-wrap gap-3">
        {file("reading", "reading", t.reading, "btn btn-primary")}
        {!printed ? (
          <>
            {file("block", "block", t.block, "btn btn-outline")}
            {file("cover", "cover", t.cover, "btn btn-outline")}
            {file("spec", "spec", t.spec, "btn btn-ghost", false)}
          </>
        ) : null}
      </div>
      <RenderStatus job={job} waiting={waiting} labels={t.progress} />
      {error ? <div className="mt-3"><Alert>{error}</Alert></div> : null}
    </>
  );
}
