import { appendFile, mkdir, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Журнал замеров (план G1, docs/microservices/10-go-plan-2026-11-24.md): время и память вёрстки PDF, память процессов,
 * сколько файлов и байт отдаёт Node. Строки JSON в <папка>/perf-ГГГГ-ММ.jsonl; сводка — scripts/perf/perf-summary.mjs.
 *
 * Папка — PERF_LOG_DIR, иначе в проде рядом с хранилищем (<STORAGE_DIR>/../mybook-logs). В разработке и тестах журнал
 * выключен; PERF_LOG=off — выключить везде. Запись не ждётся и не роняет запрос: ошибка диска пишется в консоль один раз.
 * Без зависимостей от env.ts и next: модуль подключают и процесс вёрстки PDF, и mybook-worker.
 */
export function perfLogDir(env: Record<string, string | undefined> = process.env): string | null {
  if (env.PERF_LOG === "off") return null;
  if (env.PERF_LOG_DIR) return path.resolve(env.PERF_LOG_DIR);
  if (env.NODE_ENV !== "production" || !env.STORAGE_DIR) return null;
  return path.join(path.dirname(path.resolve(env.STORAGE_DIR)), "mybook-logs");
}

/** Имя процесса в журнале: PM2 кладёт имя приложения в переменную name; запасная копия выкатки — по порту. */
export function perfProc(env: Record<string, string | undefined> = process.env): string {
  return env.MYBOOK_PERF_PROC || env.name || (env.PORT ? `node:${env.PORT}` : "node");
}

let dirReady: Promise<string | null> | undefined;
let warned = false;

export function perfLog(kind: string, data: Record<string, unknown>): void {
  dirReady ??= (async () => {
    const dir = perfLogDir();
    if (dir) await mkdir(dir, { recursive: true });
    return dir;
  })();
  const line = `${JSON.stringify({ t: new Date().toISOString(), kind, proc: perfProc(), pid: process.pid, ...data })}\n`;
  dirReady
    .then((dir) => (dir ? appendFile(path.join(dir, `perf-${line.slice(6, 13)}.jsonl`), line) : undefined))
    .catch((err) => {
      if (warned) return;
      warned = true;
      console.warn("[perf] журнал замеров не пишется:", err instanceof Error ? err.message : err);
    });
}

const mb = (bytes: number) => Math.round(bytes / 1048576);

/** Память текущего процесса, МБ: всего (RSS), пик за жизнь процесса, куча JS, память вне кучи (Buffer, sharp). */
export function memorySnapshot() {
  const m = process.memoryUsage();
  return { rssMb: mb(m.rss), peakRssMb: Math.round(process.resourceUsage().maxRSS / 1024), heapMb: mb(m.heapUsed), heapTotalMb: mb(m.heapTotal), externalMb: mb(m.external), buffersMb: mb(m.arrayBuffers) };
}

type Counter = { n: number; bytes: number; ms: number; maxMs: number; statuses: Record<string, number> };
/**
 * Таблица счётчиков — одна на процесс, в globalThis: Next загружает этот модуль отдельным экземпляром в каждом своём
 * рантайме (инструментация, маршруты, страницы), а сброс раз в 5 минут идёт из инструментации (24.11: маршруты считали
 * в свою копию, и в журнал ничего не попадало).
 */
const COUNTERS = Symbol.for("mybook.perfCounters");
const counters: Map<string, Counter> = ((globalThis as Record<symbol, unknown>)[COUNTERS] ??= new Map<string, Counter>()) as Map<string, Counter>;

/**
 * Счётчик отдачи файлов и чтений хранилища: сколько раз, сколько байт, сколько мс. Сбрасывается в журнал вместе с
 * замером памяти (раз в 5 минут) — построчно на каждый запрос не пишем.
 */
export function countPerf(name: string, bytes: number, ms: number, status?: number): void {
  const c = counters.get(name) ?? { n: 0, bytes: 0, ms: 0, maxMs: 0, statuses: {} };
  c.n++;
  c.bytes += bytes;
  c.ms += ms;
  c.maxMs = Math.max(c.maxMs, ms);
  if (status !== undefined) c.statuses[status] = (c.statuses[status] ?? 0) + 1;
  counters.set(name, c);
}

/** Счётчики с прошлого сброса (и обнулить). */
export function takeCounters(): Record<string, Counter & { mb: number }> {
  const out: Record<string, Counter & { mb: number }> = {};
  for (const [k, c] of counters) out[k] = { ...c, ms: Math.round(c.ms), maxMs: Math.round(c.maxMs), mb: Math.round((c.bytes / 1048576) * 10) / 10 };
  counters.clear();
  return out;
}

/** Память процесса по /proc (Linux): RSS и пик, МБ. null — процесса нет или не Linux. */
async function procMemory(pid: number): Promise<{ rssMb: number; peakRssMb: number; comm: string } | null> {
  try {
    const status = await readFile(`/proc/${pid}/status`, "utf8");
    const kb = (field: string) => Number(new RegExp(`^${field}:\\s+(\\d+)`, "m").exec(status)?.[1] ?? 0);
    return { rssMb: Math.round(kb("VmRSS") / 1024), peakRssMb: Math.round(kb("VmHWM") / 1024), comm: /^Name:\s+(.+)$/m.exec(status)?.[1] ?? "" };
  } catch {
    return null;
  }
}

async function childPids(pid: number): Promise<number[]> {
  try {
    const tasks = await readdir(`/proc/${pid}/task`);
    const lists = await Promise.all(tasks.map((t) => readFile(`/proc/${pid}/task/${t}/children`, "utf8").catch(() => "")));
    return lists.flatMap((l) => l.split(/\s+/).filter(Boolean).map(Number));
  } catch {
    return [];
  }
}

/**
 * Память всех процессов PM2 на сервере (по pid-файлам PM2 и /proc) с дочерними процессами — вёрстка PDF, ffmpeg.
 * Пусто — не Linux или PM2 нет.
 */
export async function pm2Memory(home = process.env.PM2_HOME || path.join(os.homedir(), ".pm2")) {
  const out: Record<string, { rssMb: number; peakRssMb: number; children?: { comm: string; rssMb: number; peakRssMb: number }[] }> = {};
  const files = await readdir(path.join(home, "pids")).catch(() => [] as string[]);
  for (const file of files) {
    const name = /^(.+)-\d+\.pid$/.exec(file)?.[1];
    if (!name) continue;
    const pid = Number((await readFile(path.join(home, "pids", file), "utf8").catch(() => "")).trim());
    const mem = pid ? await procMemory(pid) : null;
    if (!mem) continue;
    const kids = (await Promise.all((await childPids(pid)).map(procMemory))).filter((k) => k !== null);
    out[name] = { rssMb: mem.rssMb, peakRssMb: mem.peakRssMb, ...(kids.length ? { children: kids } : {}) };
  }
  return out;
}

/** Интервал замера памяти, мс: PERF_SAMPLE_MIN (по умолчанию 5 минут). */
export function perfSampleMs(value = process.env.PERF_SAMPLE_MIN): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 60_000) : 5 * 60_000;
}

let sampler: ReturnType<typeof setInterval> | undefined;

/**
 * Раз в 5 минут: память этого процесса и счётчики файлов; с pm2 — ещё память всех процессов PM2 (запускает
 * mybook-worker, один на сервер). Без папки журнала ничего не делает.
 */
export function startPerfSampler(opts: { pm2?: boolean } = {}): void {
  if (sampler || !perfLogDir()) return;
  const tick = async () => {
    perfLog("mem", { ...memorySnapshot(), uptimeMin: Math.round(process.uptime() / 60) });
    const files = takeCounters();
    if (Object.keys(files).length) perfLog("files", { counters: files });
    if (opts.pm2) {
      const procs = await pm2Memory();
      if (Object.keys(procs).length) perfLog("pm2", { procs });
    }
  };
  sampler = setInterval(() => void tick().catch(() => {}), perfSampleMs());
  sampler.unref();
  void tick().catch(() => {});
}
