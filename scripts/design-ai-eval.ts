// Прогон ИИ-дизайнера на настоящей модели (Claude Haiku 5.5): набор просьб с проверками результата. Тратит деньги —
// запускать вручную: ANTHROPIC_API_KEY=… npx tsx --import ./scripts/preload.mjs scripts/design-ai-eval.ts [--only=<id>] [--runs=<n>]
// Ничего не пишет в базу. Итог — какие просьбы выполнены, сколько понадобилось попыток и токенов.
import Anthropic from "@anthropic-ai/sdk";
import { designFromTemplate, type CoverDesign } from "@/lib/book/cover-design";
import { getCoverTemplate } from "@/lib/book/covers";
import { coverMeta } from "@/lib/book/covers/meta";
import { formats } from "@/lib/book/formats";
import { DESIGN_AI_MODEL, runDesignAi, type Ask, type CoverState, type DesignBookContext, type PagesState } from "@/lib/book/design-ai";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("Нужен ANTHROPIC_API_KEY. Прогон тратит деньги — запускайте осознанно.");
  process.exit(1);
}
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
const runs = Number(process.argv.find((a) => a.startsWith("--runs="))?.slice(7) ?? 1);

const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 90_000 });
const ask: Ask = async ({ system, user, effort, schema }) => {
  const res = await client.messages.create({
    model: DESIGN_AI_MODEL,
    max_tokens: 16000,
    output_config: { effort, format: { type: "json_schema", schema } },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral", ttl: "1h" } }],
    messages: [{ role: "user", content: user }],
  } as Anthropic.MessageCreateParamsNonStreaming);
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return { text, usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, cacheReadTokens: res.usage.cache_read_input_tokens ?? 0, cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0 } };
};

const book: DesignBookContext = { title: "Там, где ты", kind: "gift", language: "ru", format: formats.a5, ui: "ru", chapters: [{ key: "childhood", title: "Детство" }, { key: "love", title: "Как мы познакомились" }] };
const pages = (): PagesState => ({ interior: "classic", style: {} });
const cover = (): CoverState => ({ template: "linen", design: designFromTemplate(coverMeta(getCoverTemplate("linen")), { title: "Там, где ты", subtitle: "", names: "Элия & Олжас" }, formats.a5) });
const hex = (c: unknown) => (typeof c === "string" ? parseInt(c.slice(1), 16) : -1);
const dark = (c: unknown) => {
  const n = hex(c);
  if (n < 0) return false;
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 < 90;
};
const titleOf = (d: CoverDesign) => d.layers.find((l) => l.kind === "text" && l.bind === "title");

type Case = { id: string; request: string } & ({ target: "pages"; check: (s: PagesState) => string | null } | { target: "cover"; check: (s: CoverState) => string | null });
const cases: Case[] = [
  { id: "bigger", target: "pages", request: "сделай шрифт крупнее, книгу будет читать бабушка", check: (s) => ((s.style.body?.size ?? 0) >= 11.5 ? null : `кегль ${s.style.body?.size}`) },
  { id: "novel", target: "pages", request: "хочу как классический роман, с буквицей", check: (s) => (s.interior !== "classic" || s.style.elements?.dropCap === "drop" || s.style.elements?.dropCap === "raised" ? null : "ни стиля, ни буквицы") },
  { id: "sans", target: "pages", request: "современно и строго, основной текст без засечек", check: (s) => (s.style.fonts?.body?.font || s.interior !== "classic" ? null : "шрифт не поменялся") },
  { id: "chapter", target: "pages", request: "главу «Как мы познакомились» сделай особенной — бордовый акцент", check: (s) => (s.style.chapters?.love?.accent ? null : "нет оформления главы love") },
  { id: "offtopic", target: "pages", request: "напиши мне стих про осень", check: (s) => (JSON.stringify(s) === JSON.stringify(pages()) ? null : "изменил оформление на не ту просьбу") },
  { id: "navy-gold", target: "cover", request: "тёмно-синий фон, а название крупнее и золотом", check: (s) => (s.design.background.kind === "color" && dark(s.design.background.color) && titleOf(s.design) ? null : "фон не тёмный") },
  { id: "frame", target: "cover", request: "добавь тонкую рамку по краю", check: (s) => (s.design.layers.some((l) => l.kind === "shape" && ["frame", "double", "rect", "corners"].includes(l.shape)) ? null : "нет рамки") },
  { id: "pastel", target: "cover", request: "сделай нежно, в пастельных тонах", check: (s) => (JSON.stringify(s.design) !== JSON.stringify(cover().design) ? null : "ничего не поменялось") },
];

let pass = 0;
let total = 0;
const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
for (const c of cases.filter((x) => !only || x.id === only)) {
  for (let i = 0; i < runs; i++) {
    total++;
    const started = Date.now();
    const res = c.target === "pages" ? await runDesignAi(ask, { target: "pages", request: c.request, state: pages(), book }) : await runDesignAi(ask, { target: "cover", request: c.request, state: cover(), book });
    const fail = c.target === "pages" ? c.check(res.state as PagesState) : c.check(res.state as CoverState);
    if (!fail) pass++;
    tokens.input += res.usage.inputTokens;
    tokens.output += res.usage.outputTokens;
    tokens.cacheRead += res.usage.cacheReadTokens;
    tokens.cacheWrite += res.usage.cacheWriteTokens;
    console.log(`${fail ? "✗" : "✓"} ${c.id.padEnd(10)} попыток ${res.attempts}, ${((Date.now() - started) / 1000).toFixed(1)} с${fail ? ` — ${fail}` : ""}${res.errors.length ? ` · замечания: ${res.errors.join("; ")}` : ""}\n    «${res.reply}»`);
  }
}
console.log(`\nИтог: ${pass}/${total}. Токены: вход ${tokens.input}, выход ${tokens.output}, кэш чтение ${tokens.cacheRead}, кэш запись ${tokens.cacheWrite}.`);
