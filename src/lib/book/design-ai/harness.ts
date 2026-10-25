/**
 * Harness ИИ-дизайнера для Claude Haiku. Три режима: правка (просьба → новое оформление), три варианта (разные
 * направления на выбор) и оценка (балл, сильные стороны и советы, каждый применяется кнопкой). Ход один: запрос →
 * ответ JSON по схеме режима → операции применяются к оформлению → проверки разбора и критика (critic.ts) → при
 * замечаниях один круг исправления: модели показывают, что не применилось или вышло слабо, и она отвечает заново по
 * тому же исходному оформлению. Критик спрашивает только о новых недочётах — старые не повод переделывать непрошеное.
 * Сеть — только через ask (порт LanguageModel), поэтому логику проверяют тесты с подставной моделью, а прогон на
 * настоящей — scripts/design-ai-eval.ts.
 */
import type { BookFormat } from "../formats";
import { critiqueCover, critiquePages, newAdvice, type Advice } from "./critic";
import { polishDesigns, type PreviewImage } from "./polish";
import { applyCoverOps, applyPagesOps, changed, DESIGN_OPS, designAiSchema, MAX_OPS, reviewSchema, variantsSchema, type CoverLayoutContext, type CoverState, type DesignOp, type DesignTarget, type PagesState } from "./ops";
import { systemPrompt, userPrompt, type DesignBookContext, type DesignMode, type DesignTurn } from "./prompts";

/** Сколько раз спрашиваем модель за одну просьбу клиента: ответ и одно исправление. */
export const MAX_ATTEMPTS = 2;

/** Вариантов за одну просьбу. */
export const VARIANTS = 3;

export interface AskResult {
  text: string;
  usage?: { inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number };
}

export type Ask = (req: { system: string; user: string; effort: "low" | "medium" | "high"; schema: Record<string, unknown>; cachePrefix: string; images?: PreviewImage[] }) => Promise<AskResult>;

export type DesignState<T extends DesignTarget> = T extends "pages" ? PagesState : CoverState;

export interface DesignAiInput<T extends DesignTarget> {
  target: T;
  /** edit — правка по просьбе, create — придумать дизайн заново (по умолчанию edit). */
  mode?: "edit" | "create";
  request: string;
  state: DesignState<T>;
  book: DesignBookContext;
  /** Прошлые просьбы этой сессии редактора — для «ещё», «верни», «не то». */
  history?: DesignTurn[];
  /** Тексты и фото книги для готовых макетов обложки (apply_layout). */
  layout?: CoverLayoutContext;
  /**
   * Нарисовать оформление картинкой (обложка — сама обложка, страницы — лист первых страниц): после ответа модель смотрит
   * на неё и правит недостатки (polish.ts). Не задано — осмотра нет. null вместо картинки — осмотр пропускается.
   */
  preview?: (state: DesignState<T>) => Promise<PreviewImage | null>;
}

type Usage = { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
interface Run {
  attempts: number;
  usage: Usage;
}

export interface DesignAiResult<T extends DesignTarget> extends Run {
  /** Идея дизайна, как её объясняет дизайнер (пустая у мелких правок). */
  concept: string;
  reply: string;
  state: DesignState<T>;
  ops: DesignOp[];
  /** Что так и не применилось (после исправления) — для журнала и честного ответа. */
  errors: string[];
  changed: boolean;
  /** Что нашёл осмотр готовой обложки и применено ли исправление. */
  polish?: { defects: string[]; fixed: boolean };
}

export interface DesignVariant<T extends DesignTarget> {
  name: string;
  idea: string;
  state: DesignState<T>;
  ops: DesignOp[];
  errors: string[];
}

export interface DesignVariantsResult<T extends DesignTarget> extends Run {
  reply: string;
  variants: DesignVariant<T>[];
  /** Осмотр картинкой: fixed — хоть один вариант поправлен, ok — смотрели, правок нет; нет поля — осмотра не было. */
  polish?: "ok" | "fixed";
}

export interface DesignTip<T extends DesignTarget> {
  title: string;
  why: string;
  /** Оформление после совета; null — совет словами, применять нечего. */
  state: DesignState<T> | null;
  ops: DesignOp[];
}

export interface DesignReviewResult<T extends DesignTarget> extends Run {
  score: number;
  summary: string;
  strengths: string[];
  tips: DesignTip<T>[];
}

function addUsage(into: Usage, more: Usage) {
  into.inputTokens += more.inputTokens;
  into.outputTokens += more.outputTokens;
  into.cacheReadTokens += more.cacheReadTokens;
  into.cacheWriteTokens += more.cacheWriteTokens;
}

// ─── разбор ответа ─────────────────────────────────────────────────────────

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function opsOf(raw: unknown): DesignOp[] {
  return Array.isArray(raw)
    ? raw
        .filter((x): x is DesignOp => isObj(x) && (DESIGN_OPS as readonly string[]).includes(String(x.op)))
        .map((x) => ({ op: x.op, path: String(x.path ?? ""), value: typeof x.value === "string" ? x.value : JSON.stringify(x.value ?? "") }))
        .slice(0, MAX_OPS)
    : [];
}

// ─── общее ─────────────────────────────────────────────────────────────────

function applier<T extends DesignTarget>(input: DesignAiInput<T>) {
  const apply = (ops: DesignOp[]): { state: DesignState<T>; errors: string[] } =>
    input.target === "pages"
      ? (applyPagesOps(input.state as PagesState, ops) as { state: DesignState<T>; errors: string[] })
      : (applyCoverOps(input.state as CoverState, ops, input.book.format as BookFormat, input.layout) as { state: DesignState<T>; errors: string[] });
  const critique = (state: DesignState<T>): Advice[] => (input.target === "pages" ? critiquePages(state as PagesState) : critiqueCover(state as CoverState, input.layout?.texts ?? input.book.texts));
  const before = critique(input.state);
  /** Операции → оформление, ошибки разбора и новые замечания критика. */
  return (ops: DesignOp[]) => {
    const applied = apply(ops);
    return { ...applied, advice: ops.length ? newAdvice(before, critique(applied.state)) : [] };
  };
}

/**
 * Разговор с моделью в режиме mode: ответ → разбор → проверка; замечания — повод для одного круга исправления.
 * Возвращает последний разобранный ответ (или null, если модель так и не ответила по схеме).
 */
async function converse<T extends DesignTarget, A>(
  ask: Ask,
  input: DesignAiInput<T>,
  mode: DesignMode,
  schema: Record<string, unknown>,
  effort: "medium" | "high",
  read: (raw: unknown) => A | null,
  check: (answer: A) => string[],
): Promise<Run & { answer: A | null }> {
  const system = systemPrompt(input.target);
  const usage: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  let retry: { answer: unknown; errors: string[] } | undefined;
  let answer: A | null = null;
  let attempts = 0;
  while (attempts < MAX_ATTEMPTS) {
    attempts++;
    const res = await ask({ system, user: userPrompt(input.target, input.book, input.state, input.request, retry, { mode, history: input.history }), effort, schema, cachePrefix: system });
    usage.inputTokens += res.usage?.inputTokens ?? 0;
    usage.outputTokens += res.usage?.outputTokens ?? 0;
    usage.cacheReadTokens += res.usage?.cacheReadTokens ?? 0;
    usage.cacheWriteTokens += res.usage?.cacheWriteTokens ?? 0;
    const raw = parseJson(res.text);
    const next = raw === null ? null : read(raw);
    if (next === null) {
      retry = { answer: res.text.slice(0, 2000), errors: ["ответ не JSON по схеме режима"] };
      continue;
    }
    answer = next;
    const issues = check(next);
    if (!issues.length) break;
    retry = { answer: raw, errors: issues };
  }
  return { answer, attempts, usage };
}

// ─── правка ────────────────────────────────────────────────────────────────

/**
 * Просьба клиента → новое оформление. state — текущее (из редактора, ещё не обязательно сохранённое), request — текст
 * клиента. Ничего не сохраняет: результат применяет редактор (с отменой), он же сохраняет.
 */
export async function runDesignAi<T extends DesignTarget>(ask: Ask, input: DesignAiInput<T>): Promise<DesignAiResult<T>> {
  const apply = applier(input);
  const mode = input.mode === "create" ? "create" : "edit";
  const run = await converse(
    ask,
    input,
    mode,
    designAiSchema as unknown as Record<string, unknown>,
    mode === "create" ? "high" : "medium",
    (raw) => (isObj(raw) ? { concept: str(raw.concept, 400), reply: str(raw.reply, 600), ops: opsOf(raw.ops) } : null),
    (a) => {
      const r = apply(a.ops);
      return [...r.errors, ...r.advice];
    },
  );
  if (!run.answer) return { concept: "", reply: "", state: input.state, ops: [], errors: ["нет ответа по схеме"], changed: false, attempts: run.attempts, usage: run.usage };
  const r = apply(run.answer.ops);
  let state = r.state;
  let polish: DesignAiResult<T>["polish"];
  if (input.preview && changed(state, input.state)) {
    const image = await input.preview(state).catch(() => null);
    if (image) {
      const p = await polishDesigns(ask, { target: input.target, book: input.book, request: input.request, layout: input.layout }, [state], [image]);
      state = p.results[0].state;
      polish = { defects: p.results[0].defects, fixed: p.results[0].fixed };
      addUsage(run.usage, p.usage);
    }
  }
  return { concept: run.answer.concept, reply: run.answer.reply, state, ops: run.answer.ops, errors: r.errors, changed: changed(state, input.state), polish, attempts: run.attempts + (polish ? 1 : 0), usage: run.usage };
}

// ─── три варианта ──────────────────────────────────────────────────────────

/** Три разных направления под просьбу: каждый вариант — своё оформление от текущего. Пустые и повторы отбрасываются. */
export async function runDesignVariants<T extends DesignTarget>(ask: Ask, input: DesignAiInput<T>): Promise<DesignVariantsResult<T>> {
  const apply = applier(input);
  type Raw = { reply: string; variants: { name: string; idea: string; ops: DesignOp[] }[] };
  const run = await converse<T, Raw>(
    ask,
    input,
    "variants",
    variantsSchema as unknown as Record<string, unknown>,
    "high",
    (raw) => (isObj(raw) && Array.isArray(raw.variants) ? { reply: str(raw.reply, 400), variants: raw.variants.filter(isObj).map((v) => ({ name: str(v.name, 60), idea: str(v.idea, 240), ops: opsOf(v.ops) })) } : null),
    (a) => {
      const issues: string[] = [];
      if (a.variants.length !== VARIANTS) issues.push(`нужно ровно ${VARIANTS} варианта, а не ${a.variants.length}`);
      const seen: string[] = [];
      a.variants.forEach((v, i) => {
        const r = apply(v.ops);
        const label = `вариант ${i + 1} «${v.name}»`;
        for (const e of [...r.errors, ...r.advice]) issues.push(`${label}: ${e}`);
        const key = JSON.stringify(r.state);
        if (!changed(r.state, input.state)) issues.push(`${label}: ничего не меняет`);
        else if (seen.includes(key)) issues.push(`${label}: повторяет другой вариант — нужен заметно другой`);
        seen.push(key);
      });
      return issues;
    },
  );
  const variants: DesignVariant<T>[] = [];
  for (const v of run.answer?.variants ?? []) {
    const r = apply(v.ops);
    if (!changed(r.state, input.state) || variants.some((x) => !changed(x.state, r.state))) continue;
    variants.push({ name: v.name, idea: v.idea, state: r.state, ops: v.ops, errors: r.errors });
    if (variants.length === VARIANTS) break;
  }
  // Осмотр глазами: все варианты — одним запросом (картинки по порядку); исправляются те, где нашлись недостатки.
  let polished = false;
  let anyFixed = false;
  if (input.preview && variants.length) {
    const images = await Promise.all(variants.map((v) => input.preview!(v.state).catch(() => null)));
    if (images.every((i): i is PreviewImage => !!i)) {
      const p = await polishDesigns(ask, { target: input.target, book: input.book, request: input.request, layout: input.layout }, variants.map((v) => v.state), images);
      p.results.forEach((x, i) => {
        if (x.fixed) {
          variants[i] = { ...variants[i], state: x.state };
          anyFixed = true;
        }
      });
      addUsage(run.usage, p.usage);
      polished = true;
    }
  }
  return { reply: run.answer?.reply ?? "", variants, polish: polished ? (anyFixed ? "fixed" : "ok") : undefined, attempts: run.attempts + (polished ? 1 : 0), usage: run.usage };
}

// ─── оценка ────────────────────────────────────────────────────────────────

/** Честная оценка текущего оформления: балл, вывод, сильные стороны и советы, которые применяются кнопкой. */
export async function runDesignReview<T extends DesignTarget>(ask: Ask, input: DesignAiInput<T>): Promise<DesignReviewResult<T>> {
  const apply = applier(input);
  type Raw = { score: number; summary: string; strengths: string[]; tips: { title: string; why: string; ops: DesignOp[] }[] };
  const run = await converse<T, Raw>(
    ask,
    input,
    "review",
    reviewSchema as unknown as Record<string, unknown>,
    "medium",
    (raw) =>
      isObj(raw)
        ? {
            score: Math.min(10, Math.max(1, Math.round(Number(raw.score) || 0))),
            summary: str(raw.summary, 500),
            strengths: (Array.isArray(raw.strengths) ? raw.strengths : []).map((x) => str(x, 200)).filter(Boolean).slice(0, 3),
            tips: (Array.isArray(raw.tips) ? raw.tips : []).filter(isObj).map((t) => ({ title: str(t.title, 120), why: str(t.why, 300), ops: opsOf(t.ops) })).filter((t) => t.title).slice(0, 4),
          }
        : null,
    (a) => a.tips.flatMap((t, i) => apply(t.ops).errors.map((e) => `совет ${i + 1} «${t.title}»: ${e}`)),
  );
  const tips: DesignTip<T>[] = (run.answer?.tips ?? []).map((t) => {
    const r = t.ops.length ? apply(t.ops) : null;
    return { title: t.title, why: t.why, ops: t.ops, state: r && changed(r.state, input.state) ? r.state : null };
  });
  return { score: run.answer?.score ?? 0, summary: run.answer?.summary ?? "", strengths: run.answer?.strengths ?? [], tips, attempts: run.attempts, usage: run.usage };
}
