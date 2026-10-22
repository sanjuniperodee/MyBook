"use client";

import { useEffect, useState } from "react";
import type { BuildProgress, RenderStageName } from "@/lib/book/book-build";
import { cn } from "@/lib/class-names";
import type { RenderKind, RenderSnapshot } from "@/modules/production";

/** Тексты хода сборки — из словаря orders.order.progress (кабинет клиента — на языке сайта, админка — по-русски). */
export interface RenderProgressLabels {
  stages: Record<RenderStageName, string>;
  starting: string;
  queued: (ahead: number) => string;
  left: (time: string) => string;
  almost: string;
  slower: string;
  seconds: (n: number) => string;
  minutes: (m: number, s: number) => string;
  failed: string;
}

/** Срок «осталось» без дрожания: до минуты — с шагом 5 секунд, дальше — 10. Меньше 5 секунд — «почти готово» (null). */
export function formatEta(ms: number, l: Pick<RenderProgressLabels, "seconds" | "minutes">): string | null {
  const s = ms / 1000;
  if (s < 5) return null;
  if (s < 60) return l.seconds(Math.round(s / 5) * 5);
  const rounded = Math.round(s / 10) * 10;
  return l.minutes(Math.floor(rounded / 60), rounded % 60);
}

/** Какая из идущих сборок нужна кнопке: идущая важнее ждущей. */
function pick(jobs: RenderSnapshot[], kinds: readonly RenderKind[]): RenderSnapshot | null {
  const mine = jobs.filter((j) => kinds.includes(j.kind));
  return mine.find((j) => j.state === "running") ?? mine[0] ?? null;
}

/**
 * Ход сборки файлов заказа, пока active: раз в секунду спрашивает сервер (сама сборка идёт отдельным запросом и отвечает
 * только в конце). Сборки, которой нет (файл уже в кэше), — null.
 */
export function useRenderProgress(orderId: string, active: boolean, kinds: readonly RenderKind[]): RenderSnapshot | null {
  const [job, setJob] = useState<RenderSnapshot | null>(null);
  const wanted = kinds.join(",");
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}/render-progress`, { cache: "no-store" });
        if (!res.ok || stopped) return;
        const { jobs } = (await res.json()) as { jobs: RenderSnapshot[] };
        if (!stopped) setJob(pick(jobs, wanted.split(",") as RenderKind[]));
      } catch {
        // Сеть мигнула — следующий опрос через секунду.
      }
    };
    void poll();
    const timer = setInterval(poll, 1000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [orderId, active, wanted]);
  return active ? job : null;
}

/**
 * Кнопки, которые собирают файл: busy — id кнопки в работе, run(id, kinds, work) запускает работу и ведёт ход сборки
 * (failed — текст, если у ошибки нет своего). waiting — сборка тянется дольше секунды, а на сервере её ещё не видно: показываем «Готовим…», а не пустоту.
 */
export function useRenderJob(orderId: string, failed: string) {
  const [busy, setBusy] = useState<string | null>(null);
  const [kinds, setKinds] = useState<RenderKind[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [late, setLate] = useState(false);
  const job = useRenderProgress(orderId, busy !== null, kinds);
  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => setLate(true), 1200);
    return () => clearTimeout(timer);
  }, [busy]);

  async function run(id: string, forKinds: RenderKind[], work: () => Promise<void>) {
    if (busy) return;
    setBusy(id);
    setKinds(forKinds);
    setError(null);
    setLate(false);
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : failed);
    } finally {
      setBusy(null);
    }
  }
  return { busy, job, error, run, waiting: busy !== null && !job && late };
}

/** Собрать файл (?prepare=1) и, когда он готов, начать скачивание из кэша. */
export async function prepareAndDownload(orderId: string, kind: string, href: string) {
  const res = await fetch(`/api/orders/${orderId}/files/${kind}?prepare=1`, { cache: "no-store" });
  if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "");
  window.location.assign(href);
}

/** «45% · осталось ≈ 20 с» — одной строкой, для мест, где полосе тесно; пусто, пока сборка в очереди. */
export function progressSummary(job: BuildProgress | null, labels: RenderProgressLabels): string {
  if (!job || job.state !== "running") return "";
  const eta = job.etaMs !== null && !job.overrun ? formatEta(job.etaMs, labels) : null;
  return `${job.percent}% · ${job.overrun ? labels.slower : eta ? labels.left(eta) : labels.almost}`;
}

/** Полоса хода сборки: этап, проценты и сколько осталось. */
export function RenderStatus({ job, waiting, labels, className }: { job: BuildProgress | null; waiting?: boolean; labels: RenderProgressLabels; className?: string }) {
  if (!job && !waiting) return null;
  const queued = job?.state === "queued";
  const percent = job && !queued ? job.percent : 0;
  const eta = job && !queued && job.etaMs !== null && !job.overrun ? formatEta(job.etaMs, labels) : null;
  const head = !job ? labels.starting : queued ? labels.queued(job.ahead) : job.stage ? labels.stages[job.stage] : labels.starting;
  const tail = !job || queued ? null : job.overrun ? labels.slower : eta ? labels.left(eta) : labels.almost;
  return (
    <div className={cn("mt-3 max-w-md", className)} role="status" aria-live="polite">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-ink">{head}</span>
        {job && !queued ? <span className="tabular-nums text-muted">{percent}%</span> : null}
      </div>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={job && !queued ? percent : undefined}
        aria-label={head}
      >
        {job && !queued ? (
          <div className="h-full rounded-full bg-wine transition-[width] duration-1000 ease-linear" style={{ width: `${percent}%` }} />
        ) : (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-wine/50" />
        )}
      </div>
      {tail ? <p className="mt-1 text-xs text-muted">{tail}</p> : null}
    </div>
  );
}
