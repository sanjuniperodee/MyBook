import { describe, expect, it, vi } from "vitest";
import { parseStageOrder, stageOrderMove, type StageOrderDeal } from "@/shared/domain/stageOrder";
import { dealVerdictPrompt, normalizeDealVerdict } from "@/modules/assistant/domain/dealVerdict";

vi.mock("server-only", () => ({}));
vi.mock("@/server/container", () => ({ container: () => ({}) }));
vi.mock("@/modules/workspace", () => ({ getSetting: async () => "" }));

const now = new Date("2026-11-15T12:00:00Z");
const ago = (days: number, hours = 0) => new Date(now.getTime() - days * 86_400_000 - hours * 3_600_000);
const cfg = parseStageOrder(JSON.stringify({ on: true, workStageId: "work", silentStageId: "silent", paidStageId: "book", silentDays: 3, lostDays: 14 }));
const deal = (p: Partial<StageOrderDeal>): StageOrderDeal => ({ stageId: "new", onEntryStage: true, createdAt: ago(1), stageChangedAt: ago(1), lastIn: ago(1), lastOut: ago(1, -1), hasOpenTask: false, ...p });

describe("Порядок в воронке: настройка", () => {
  it("выключен, пока не выбраны два разных этапа; дни — в пределах, отказ позже «не отвечает»", () => {
    expect(parseStageOrder("")).toMatchObject({ on: false, silentDays: 3, lostDays: 14, lostReason: "Не отвечает", paidStageId: "" });
    expect(parseStageOrder("не json").on).toBe(false);
    expect(parseStageOrder(JSON.stringify({ on: true, workStageId: "a", silentStageId: "a" })).on).toBe(false);
    expect(parseStageOrder(JSON.stringify({ on: true, workStageId: "a", silentStageId: "b", silentDays: 10, lostDays: 5 }))).toMatchObject({ on: true, silentDays: 10, lostDays: 11 });
    expect(parseStageOrder(JSON.stringify({ on: true, workStageId: "a", silentStageId: "b", silentDays: 999, lostDays: 999 }))).toMatchObject({ silentDays: 30, lostDays: 90 });
  });
});

describe("Порядок в воронке: решение по заявке", () => {
  it("новая заявка без нашего ответа остаётся на виду; ответили — «в работе»", () => {
    expect(stageOrderMove(deal({ lastOut: null }), cfg, now)).toBeNull();
    expect(stageOrderMove(deal({ lastOut: null, lastIn: ago(20), createdAt: ago(20) }), cfg, now)).toBeNull();
    expect(stageOrderMove(deal({}), cfg, now)).toEqual({ to: "work", why: "менеджер ответил клиенту" });
  });

  it("клиент молчит 3 дня после нашего ответа — «не отвечает»: и с первого этапа, и из «в работе»", () => {
    expect(stageOrderMove(deal({ lastIn: ago(3, 1), lastOut: ago(3) }), cfg, now)).toEqual({ to: "silent", why: "клиент не отвечает 3 дня" });
    expect(stageOrderMove(deal({ stageId: "work", onEntryStage: false, lastIn: ago(5), lastOut: ago(4) }), cfg, now)).toEqual({ to: "silent", why: "клиент не отвечает 5 дней" });
    expect(stageOrderMove(deal({ stageId: "work", onEntryStage: false, lastIn: ago(2), lastOut: ago(1) }), cfg, now)).toBeNull();
  });

  it("рассылка молчащему клиенту его не оживляет: считаем от последнего сообщения клиента", () => {
    expect(stageOrderMove(deal({ stageId: "work", onEntryStage: false, lastIn: ago(6), lastOut: ago(0, 2) }), cfg, now)).toEqual({ to: "silent", why: "клиент не отвечает 6 дней" });
  });

  it("последнее слово за клиентом и мы не ответили — не «не отвечает», а на виду", () => {
    expect(stageOrderMove(deal({ stageId: "work", onEntryStage: false, lastIn: ago(4), lastOut: ago(5) }), cfg, now)).toBeNull();
  });

  it("на этапе «не отвечает»: написал снова — «в работе»; молчит 14 дней — отказ; раньше — ждём", () => {
    const silent = { stageId: "silent", onEntryStage: false, stageChangedAt: ago(4) };
    expect(stageOrderMove(deal({ ...silent, lastIn: ago(1), lastOut: ago(8) }), cfg, now)).toEqual({ to: "work", why: "клиент снова написал" });
    expect(stageOrderMove(deal({ ...silent, lastIn: ago(14, 1), lastOut: ago(13) }), cfg, now)).toEqual({ to: "lost", why: "клиент не отвечает 14 дней" });
    expect(stageOrderMove(deal({ ...silent, lastIn: ago(9), lastOut: ago(8) }), cfg, now)).toBeNull();
  });

  it("дата события впереди (и сегодня) — молчащую заявку отказом не закрываем; дата прошла — закрываем", () => {
    const silent = { stageId: "silent", onEntryStage: false, stageChangedAt: ago(4), lastIn: ago(20), lastOut: ago(19) };
    expect(stageOrderMove(deal({ ...silent, eventDate: "2026-12-09" }), cfg, now)).toBeNull();
    expect(stageOrderMove(deal({ ...silent, eventDate: "2026-11-15" }), cfg, now)).toBeNull();
    expect(stageOrderMove(deal({ ...silent, eventDate: "2026-11-14" }), cfg, now)).toEqual({ to: "lost", why: "клиент не отвечает 20 дней" });
    expect(stageOrderMove(deal({ ...silent, eventDate: "к Новому году" }), cfg, now)).toEqual({ to: "lost", why: "клиент не отвечает 20 дней" });
    // В «не отвечает» заявка с датой уходит как обычно — это лишь подпись, она остаётся открытой.
    expect(stageOrderMove(deal({ stageId: "work", onEntryStage: false, lastIn: ago(5), lastOut: ago(4), eventDate: "2026-12-09" }), cfg, now)).toEqual({ to: "silent", why: "клиент не отвечает 5 дней" });
  });

  it("открытая задача — у менеджера свой план: в «не отвечает» и отказ не уводим", () => {
    expect(stageOrderMove(deal({ stageId: "work", onEntryStage: false, lastIn: ago(6), lastOut: ago(5), hasOpenTask: true }), cfg, now)).toBeNull();
    expect(stageOrderMove(deal({ stageId: "silent", onEntryStage: false, stageChangedAt: ago(20), lastIn: ago(30), lastOut: ago(29), hasOpenTask: true }), cfg, now)).toBeNull();
  });

  it("другие этапы («Пишет книгу») и выключенная настройка — без движения", () => {
    expect(stageOrderMove(deal({ stageId: "book", onEntryStage: false, lastIn: ago(30), lastOut: ago(29) }), cfg, now)).toBeNull();
    expect(stageOrderMove(deal({}), { ...cfg, on: false }, now)).toBeNull();
  });
});

describe("Порядок в воронке: проход", () => {
  const funnel = { pipelineId: "p", entryStageId: "new", lostStageId: "lost", openStageIds: ["new", "work", "book", "silent"] };
  const setup = async (candidates: (StageOrderDeal & { id: string; number: number; clientId: string | null })[], opts: { verdict?: unknown; paid?: { id: string; clientId: string | null; paid: number }[]; config?: typeof cfg; ai?: boolean } = {}) => {
    const { stageOrderPass } = await import("@/server/stage-order");
    const moves: [string, string, string | null][] = [];
    const notes: [string, string][] = [];
    const assessed: string[] = [];
    const result = await stageOrderPass(
      {
        config: async () => opts.config ?? cfg,
        funnel: async () => funnel,
        candidates: async () => candidates,
        paid: async () => opts.paid ?? [],
        aiReady: async () => opts.ai ?? opts.verdict !== undefined,
        assess: async (id) => (assessed.push(id), (opts.verdict ?? null) as never),
        move: async (id, stage, reason) => void moves.push([id, stage, reason]),
        note: async (d, text) => void notes.push([d.id, text]),
        logError: () => {},
      },
      now,
    );
    return { result, moves, notes, assessed };
  };
  const c = (id: string, p: Partial<StageOrderDeal>) => ({ id, number: 1, clientId: null, ...deal(p) });

  it("оплата двигает сделку на этап оплаченных; ответ — «в работе»; давнее молчание на «не отвечает» — отказ", async () => {
    const { result, moves, notes } = await setup([c("a", {}), c("b", { stageId: "silent", onEntryStage: false, stageChangedAt: ago(20), lastIn: ago(30), lastOut: ago(29) })], { paid: [{ id: "p1", clientId: "u1", paid: 10_000 }] });
    expect(moves).toEqual([
      ["p1", "book", null],
      ["a", "work", null],
      ["b", "lost", "Не отвечает"],
    ]);
    expect(result).toEqual({ paid: 1, work: 1, silent: 0, lost: 1, assessed: 0 });
    expect(notes[0][1]).toContain("получена оплата 10");
  });

  it("клиент замолчал: модель видит отказ — сразу «Отказ» с её причиной и выводом в ленте", async () => {
    const { moves, notes, assessed } = await setup([c("a", { stageId: "work", onEntryStage: false, lastIn: ago(4), lastOut: ago(3) })], { verdict: { verdict: "refused", reason: "Дорого", later: null, note: "Маме на юбилей; назвали 34 000, сказала дорого" } });
    expect(assessed).toEqual(["a"]);
    expect(moves).toEqual([["a", "lost", "Дорого"]]);
    expect(notes[0][1]).toBe("Порядок в воронке: клиент отказался — «Дорого». Вывод по переписке: Маме на юбилей; назвали 34 000, сказала дорого");
  });

  it("«подумаю» с датой и модель без ответа — на «не отвечает»; срок клиента — в заметке", async () => {
    const later = await setup([c("a", { stageId: "work", onEntryStage: false, lastIn: ago(4), lastOut: ago(3) })], { verdict: { verdict: "later", reason: null, later: "после 20 ноября", note: "Мужу; думает" } });
    expect(later.moves).toEqual([["a", "silent", null]]);
    expect(later.notes[0][1]).toBe("Порядок в воронке: клиент не отвечает 4 дня. Обещал вернуться: после 20 ноября. Вывод по переписке: Мужу; думает");
    const none = await setup([c("a", { stageId: "work", onEntryStage: false, lastIn: ago(4), lastOut: ago(3) })]);
    expect(none.moves).toEqual([["a", "silent", null]]);
    expect(none.notes[0][1]).toBe("Порядок в воронке: клиент не отвечает 4 дня.");
  });

  it("модель читает три переписки за проход: остальные замолчавшие ждут следующего; простые переходы лимит не держит", async () => {
    const many = [...Array.from({ length: 5 }, (_, i) => c(`d${i}`, { stageId: "work", onEntryStage: false, lastIn: ago(4), lastOut: ago(3) })), c("fresh", {})];
    const { assessed, moves, result } = await setup(many, { verdict: { verdict: "silent", reason: null, later: null, note: "" } });
    expect(assessed).toEqual(["d0", "d1", "d2"]);
    expect(moves.map((m) => m[0])).toEqual(["d0", "d1", "d2", "fresh"]);
    expect(result).toMatchObject({ silent: 3, work: 1, assessed: 3 });
  });

  it("модель не подключена — все замолчавшие уходят в «не отвечает» без вывода; модель ошиблась — тоже; выключено — ничего", async () => {
    const many = Array.from({ length: 5 }, (_, i) => c(`d${i}`, { stageId: "work", onEntryStage: false, lastIn: ago(4), lastOut: ago(3) }));
    const off = await setup(many);
    expect(off.assessed).toEqual([]);
    expect(off.result).toMatchObject({ silent: 5, assessed: 0 });
    const failed = await setup(many.slice(0, 1), { ai: true });
    expect(failed.moves).toEqual([["d0", "silent", null]]);
    expect((await setup(many, { config: { ...cfg, on: false } })).result).toBeNull();
  });
});

describe("Вывод модели по заявке", () => {
  const reasons = ["Дорого", "Передумал", "Не успеваем к дате", "Выбрал другой подарок"];

  it("причина — только из списка воронки; у отказа без причины — «Передумал»; срок — только у later", () => {
    expect(normalizeDealVerdict({ verdict: "refused", reason: "Дорого", later: "завтра", note: "  Маме;   дорого " }, reasons)).toEqual({ verdict: "refused", reason: "Дорого", later: null, note: "Маме; дорого" });
    expect(normalizeDealVerdict({ verdict: "refused", reason: "нет денег", later: "", note: "" }, reasons)).toMatchObject({ reason: "Передумал" });
    expect(normalizeDealVerdict({ verdict: "later", reason: "Дорого", later: "после зарплаты", note: "" }, reasons)).toEqual({ verdict: "later", reason: null, later: "после зарплаты", note: "" });
    expect(normalizeDealVerdict({ verdict: "silent", reason: "", later: "", note: "После 11.11 не отвечает.}" }, reasons)?.note).toBe("После 11.11 не отвечает.");
    expect(normalizeDealVerdict({ verdict: "покупает" }, reasons)).toBeNull();
    expect(normalizeDealVerdict(null, reasons)).toBeNull();
  });

  it("в подсказке — причины воронки и правило «подумаю — не отказ»", () => {
    const prompt = dealVerdictPrompt(reasons, "2026-11-15");
    expect(prompt).toContain("«Не успеваем к дате»");
    expect(prompt).toContain("это later, а не refused");
  });
});
