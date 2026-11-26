import { describe, expect, it, vi } from "vitest";
import { AI_STAGES, aiManagerDecision, aiStageDecision, nameInText, parseAiStages, quoteIn, stageRoles } from "@/shared/domain/aiStages";
import { aiNoteText, aiProposalTitle } from "@/shared/domain/aiProposals";
import { AI_CRM_FLAGS, aiFlagOn, aiFlagValue, isAiCrmFlag } from "@/shared/domain/aiCrm";
import { cleanReason, normalizeStageReview, numberedTranscript, stageReviewSchema } from "@/modules/assistant/domain/stageReview";

vi.mock("server-only", () => ({}));
vi.mock("@/server/container", () => ({ container: () => ({}) }));
vi.mock("@/modules/workspace", () => ({ getSetting: async () => "" }));

const { aiStagesPass, stageAbout } = await import("@/server/ai-stages");

// Воронка как на проде 26.11: роли — из «Порядка в воронке» и вех, а не из названий.
const stages = stageRoles(
  [
    { id: "new", name: "Новая заявка", kind: "open", position: 0, milestone: null },
    { id: "work", name: "Взяли в работу", kind: "open", position: 1, milestone: null },
    { id: "ndz", name: "НДЗ", kind: "open", position: 2, milestone: null },
    { id: "book", name: "Пишет книгу", kind: "open", position: 3, milestone: "book_started" },
    { id: "ready", name: "Готова к заказу", kind: "open", position: 4, milestone: "book_ready" },
    { id: "won", name: "Заказ оформлен", kind: "won", position: 5, milestone: "order_created" },
    { id: "lost", name: "Отказ", kind: "lost", position: 6, milestone: null },
  ],
  JSON.stringify({ on: true, workStageId: "work", silentStageId: "ndz", paidStageId: "book" }),
);
const st = (id: string) => stages.find((s) => s.id === id)!;
const decide = (from: string, to: string | null, p: Partial<Parameters<typeof aiStageDecision>[0]> = {}) =>
  aiStageDecision({ current: st(from), target: to ? st(to) : null, confidence: 0.9, quoteOk: true, quoteFromClient: true, lostReason: to === "lost" ? "Дорого" : null, silentFor: 5, silentDays: 3, ...p });

describe("ИИ ведёт этапы: настройка и роли", () => {
  it("выключено, пока явно не включили", () => {
    expect(parseAiStages("")).toEqual({ on: false });
    expect(parseAiStages("мусор")).toEqual({ on: false });
    expect(parseAiStages(JSON.stringify({ on: "yes" }))).toEqual({ on: false });
    expect(parseAiStages(JSON.stringify({ on: true }))).toEqual({ on: true });
  });

  it("роли — по настройке и вехам: первый открытый — новая заявка, оплата важнее вехи", () => {
    expect(stages.map((s) => s.role)).toEqual(["entry", "work", "silent", "paid", "milestone", "won", "lost"]);
    expect(stageAbout(st("ready"))).toContain("Книга почти готова");
    expect(stageAbout(st("won"))).toContain("сам не выбирай");
  });
});

describe("ИИ ведёт этапы: что ИИ делает сам, а что предлагает", () => {
  it("между этапами разговора — сам, если уверен; не уверен — предложение; совсем не уверен — ничего", () => {
    expect(decide("work", "ndz")).toBe("apply");
    expect(decide("ndz", "work")).toBe("apply");
    expect(decide("new", "work")).toBe("apply");
    expect(decide("work", "ndz", { confidence: AI_STAGES.apply - 0.01 })).toBe("propose");
    expect(decide("work", "ndz", { confidence: AI_STAGES.propose - 0.01 })).toBeNull();
  });

  it("«не отвечает» — только когда клиент молчит столько, сколько ждёт «Порядок в воронке»: вчерашнее «подумаю» — ещё разговор", () => {
    expect(decide("work", "ndz", { silentFor: 1 })).toBeNull();
    expect(decide("work", "ndz", { silentFor: 3 })).toBe("apply");
  });

  it("шаг назад по воронке — предложением и только при уверенности", () => {
    expect(decide("ready", "book")).toBe("propose");
    expect(decide("ready", "book", { confidence: 0.7 })).toBeNull();
  });

  it("отказ сам — только по словам клиента и с причиной; по словам менеджера или без уверенности — предложение", () => {
    expect(decide("work", "lost")).toBe("apply");
    expect(decide("work", "lost", { quoteFromClient: false })).toBe("propose");
    expect(decide("work", "lost", { confidence: 0.7 })).toBe("propose");
    expect(decide("work", "lost", { lostReason: null })).toBeNull();
    // С этапов оплаты и книги (у сделки деньги клиента) — только предложение.
    expect(decide("book", "lost")).toBe("propose");
    expect(decide("ready", "lost")).toBe("propose");
  });

  it("деньги и книга (этапы с вехой и оплатой), откат назад и возврат из отказа — только предложением", () => {
    expect(decide("work", "book")).toBe("propose");
    expect(decide("work", "ready")).toBe("propose");
    expect(decide("ready", "work")).toBe("propose");
    expect(decide("ready", "work", { confidence: 0.7 })).toBeNull();
    expect(decide("lost", "work")).toBe("propose");
    expect(decide("book", "ndz")).toBe("propose");
  });

  it("успех ставит только заказ; без цитаты и без смены этапа — ничего", () => {
    expect(decide("ready", "won")).toBeNull();
    expect(decide("won", "work")).toBeNull();
    expect(decide("work", "ndz", { quoteOk: false })).toBeNull();
    expect(decide("work", "work")).toBeNull();
    expect(decide("work", null)).toBeNull();
  });
});

describe("ИИ ведёт этапы: цитата и ответ модели", () => {
  it("цитата ищется в сообщении без учёта регистра, пробелов, кавычек и «ё»", () => {
    expect(quoteIn("пока не нужно", "Спасибо. Но ПОКА  не нужно!")).toBe(true);
    expect(quoteIn("«ещё подумаю»", "я еще подумаю")).toBe(true);
    expect(quoteIn("передумали…", "Передумали")).toBe(true);
    expect(quoteIn("не надо", "Хорошо, жду")).toBe(false);
    expect(quoteIn("да", "да")).toBe(false);
    expect(quoteIn("", "что угодно")).toBe(false);
  });

  it("ответ модели: номера в пределах списков, причина — из списка, уверенность 0–1", () => {
    const reasons = ["Дорого", "Передумал"];
    expect(normalizeStageReview({ stage: 7, confidence: 1.4, reason: " клиент отказался }", quote: "дорого", message: 3, lost_reason: "Дорого", delivered: false, delivered_quote: "", delivered_message: 0 }, 7, 5, reasons)).toEqual({
      stage: 7,
      confidence: 1,
      reason: "клиент отказался",
      quote: "дорого",
      message: 3,
      lostReason: "Дорого",
      delivered: null,
      manager: null,
      promises: [],
      done: [],
    });
    const r = normalizeStageReview({ stage: 9, confidence: "x", reason: "", quote: "", message: 99, lost_reason: "Иное", delivered: true, delivered_quote: "получила", delivered_message: 2 }, 7, 5, reasons);
    expect(r).toMatchObject({ stage: null, confidence: 0, message: null, lostReason: null, delivered: { quote: "получила", message: 2 } });
    expect(normalizeStageReview("нет", 7, 5, reasons)).toBeNull();
    expect(stageReviewSchema(reasons).properties.lost_reason.enum).toEqual(["Дорого", "Передумал", ""]);
  });

  it("причина для ленты — без рассуждений модели о полях ответа (живой разбор 27.11)", () => {
    expect(cleanReason("Клиентка прямо отказалась от заказа 26.11 вечером; причина не названа, поэтому lost_reason пустой.")).toBe("Клиентка прямо отказалась от заказа 26.11 вечером");
    expect(cleanReason("Клиент передумал. Поле quote заполнено.")).toBe("Клиент передумал.");
    expect(cleanReason("Клиент сказал «подумаю» и молчит 3 дня.")).toBe("Клиент сказал «подумаю» и молчит 3 дня.");
  });

  it("сообщения пронумерованы по порядку — номер в ответе модели указывает на то же сообщение", () => {
    const t = numberedTranscript([
      { direction: "in", text: "Здравствуйте", at: "2026-11-20T10:00:00Z" },
      { direction: "out", text: "Добрый день!", author: "Марат", at: "2026-11-20T10:01:00Z" },
    ]);
    expect(t.split("\n")).toHaveLength(2);
    expect(t).toMatch(/^\[1\] \[[^\]]+\] Клиент: Здравствуйте\n\[2\] \[[^\]]+\] Менеджер \(Марат\): Добрый день!$/);
  });

  it("подписи предложений и ленты — с пометкой «ИИ», причиной и цитатой", () => {
    expect(aiProposalTitle({ kind: "stage", payload: { fromStageId: "a", stageId: "b", stageName: "Отказ", lostReason: "Дорого" } })).toBe("Перевести на этап «Отказ» — Дорого");
    expect(aiProposalTitle({ kind: "order_status", payload: { orderId: "o", orderNumber: 110, fromStatus: "in_production", status: "delivered" } })).toBe("Отметить заказ №110 выданным");
    expect(aiNoteText("Сделка Д5: этап «НДЗ»", "клиент обещал подумать.", "Я подумаю")).toBe("ИИ: Сделка Д5: этап «НДЗ». клиент обещал подумать — «Я подумаю».");
  });
});

describe("ИИ ведёт этапы: проход", () => {
  const messages = [
    { id: "m1", direction: "out" as const, text: "Цена 34 000 ₸" },
    { id: "m2", direction: "in" as const, text: "Для меня это дороговато. Извините" },
    { id: "m3", direction: "in" as const, text: "Все получила, спасибо!" },
  ];
  const deps = (review: Record<string, unknown> | null, over: Record<string, unknown> = {}) => {
    const calls = { moved: [] as unknown[], proposed: [] as unknown[], reviewed: [] as string[], assigned: [] as unknown[], attributed: [] as unknown[], tasks: [] as unknown[], notes: [] as string[] };
    const d = {
      config: async () => ({ stages: true, manager: true }),
      staff: async () => [
        { id: "s-indira", name: "ИндираОП" },
        { id: "s-rasul", name: "Расул" },
      ],
      assign: async (...a: unknown[]) => void calls.assigned.push(a),
      attribute: async (ids: string[], staffId: string) => (calls.attributed.push([ids, staffId]), ids.length),
      createTask: async (t: unknown) => (calls.tasks.push(["create", t]), true),
      completeTask: async (id: string, r: string) => (calls.tasks.push(["done", id, r]), true),
      raiseTask: async (id: string) => void calls.tasks.push(["raise", id]),
      note: async (_id: string, text: string) => void calls.notes.push(text),
      aiReady: async () => true,
      reviewedToday: async () => 0,
      funnel: async () => ({ pipelineId: "p", stages, silentDays: 3 }),
      candidates: async () => [{ id: "d1", stageId: "work", assigneeId: "s-rasul", order: null, lastIn: new Date() }],
      markReviewed: async (id: string) => void calls.reviewed.push(id),
      review: async () => ({ review: review as never, messages }),
      move: async (...a: unknown[]) => void calls.moved.push(a),
      propose: async (p: unknown) => (calls.proposed.push(p), true),
      logError: () => {},
      ...over,
    };
    return { d, calls };
  };
  const base = { stage: 7, confidence: 0.95, reason: "клиенту дорого", quote: "Для меня это дороговато", message: 2, lostReason: "Дорого", delivered: null, manager: null };

  it("выключено или модель не подключена — ничего не читает", async () => {
    expect(await aiStagesPass(deps(base, { config: async () => ({ stages: false, manager: false }) }).d)).toBeNull();
    expect(await aiStagesPass(deps(base, { aiReady: async () => false }).d)).toBeNull();
    expect(await aiStagesPass(deps(base, { reviewedToday: async () => AI_STAGES.perDay }).d)).toBeNull();
  });

  it("ясный отказ клиента с цитатой — сделка уходит в отказ сама, с причиной, цитатой и сообщением", async () => {
    const { d, calls } = deps(base);
    expect(await aiStagesPass(d)).toEqual({ reviewed: 1, applied: 1, proposed: 0, assigned: 0, attributed: 0 });
    expect(calls.reviewed).toEqual(["d1"]);
    expect(calls.moved).toEqual([["d1", "lost", "Дорого", { reason: "клиенту дорого", quote: "Для меня это дороговато", messageId: "m2" }]]);
  });

  it("отказ без названной причины — «Передумал»", async () => {
    const { d, calls } = deps({ ...base, lostReason: null });
    await aiStagesPass(d);
    expect(calls.moved).toEqual([["d1", "lost", "Передумал", { reason: "клиенту дорого", quote: "Для меня это дороговато", messageId: "m2" }]]);
  });

  it("цитаты нет в названном сообщении — вывод не принимается", async () => {
    const { d, calls } = deps({ ...base, message: 1 });
    expect(await aiStagesPass(d)).toEqual({ reviewed: 1, applied: 0, proposed: 0, assigned: 0, attributed: 0 });
    expect(calls.moved).toEqual([]);
  });

  it("книга на сайте — предложение; клиент получил заказ «в печати» — предложение отметить выданным", async () => {
    const { d, calls } = deps(
      { ...base, stage: 4, lostReason: null, confidence: 0.9, quote: "дороговато", delivered: { quote: "Все получила", message: 3 } },
      { candidates: async () => [{ id: "d1", stageId: "work", assigneeId: null, order: { id: "o1", number: 110, status: "in_production" }, lastIn: new Date() }] },
    );
    expect(await aiStagesPass(d)).toEqual({ reviewed: 1, applied: 0, proposed: 2, assigned: 0, attributed: 0 });
    expect(calls.proposed).toEqual([
      { dealId: "d1", kind: "stage", payload: { fromStageId: "work", stageId: "book", stageName: "Пишет книгу", lostReason: null }, reason: "клиенту дорого", quote: "дороговато", messageId: "m2", confidence: 0.9 },
      { dealId: "d1", kind: "order_status", payload: { orderId: "o1", orderNumber: 110, fromStatus: "in_production", status: "delivered" }, reason: "клиент получил книгу", quote: "Все получила", messageId: "m3", confidence: 0.9 },
    ]);
  });

  it("сотрудник представился — он ответственный, и ему приписаны наши сообщения с этого места; назвал клиент — предложение", async () => {
    const intro = [
      { id: "m1", direction: "in" as const, text: "Здравствуйте" },
      { id: "m2", direction: "out" as const, text: "Добрый день! Меня зовут Индира, менеджер MyBooks" },
      { id: "m3", direction: "out" as const, text: "Цена 34 000 ₸" },
      { id: "m4", direction: "in" as const, text: "Индира, спасибо" },
    ];
    const self = deps({ ...base, stage: null, manager: { n: 1, quote: "Меня зовут Индира", message: 2 } }, { review: async () => ({ review: { ...base, stage: null, manager: { n: 1, quote: "Меня зовут Индира", message: 2 } }, messages: intro }) });
    expect(await aiStagesPass(self.d)).toMatchObject({ assigned: 1, attributed: 2 });
    expect(self.calls.assigned).toEqual([["d1", "s-indira", "ИИ: Ответственный — ИндираОП. сотрудник представился в переписке — «Меня зовут Индира»."]]);
    expect(self.calls.attributed).toEqual([[["m2", "m3"], "s-indira"]]);

    const client = deps(null, { review: async () => ({ review: { ...base, stage: null, manager: { n: 1, quote: "Индира, спасибо", message: 4 } }, messages: intro }) });
    expect(await aiStagesPass(client.d)).toMatchObject({ assigned: 0, proposed: 1 });
    expect(client.calls.proposed).toMatchObject([{ kind: "assignee", payload: { fromAssigneeId: "s-rasul", staffId: "s-indira", staffName: "ИндираОП" } }]);

    // Модель назвала не того: имени сотрудника в цитате нет («Марат» при «Расул») — ничего.
    const wrong = deps(null, { review: async () => ({ review: { ...base, stage: null, manager: { n: 2, quote: "Меня зовут Индира", message: 2 } }, messages: intro }) });
    expect(await aiStagesPass(wrong.d)).toMatchObject({ assigned: 0, proposed: 0, attributed: 0 });
  });

  it("обещания → задачи на срок, сделанная по переписке — закрыта, просроченная без следов — поднята", async () => {
    const now = new Date("2026-11-27T06:00:00Z"); // 11:00 в Алматы
    const at = (h: number) => new Date(now.getTime() - h * 3_600_000);
    const msgs = [
      { id: "m1", direction: "in" as const, text: "Фото пришлю к пятнице", at: at(1) },
      { id: "m2", direction: "out" as const, text: "Хорошо, завтра перезвоню вам", at: at(1) },
      { id: "m3", direction: "out" as const, text: "Отправила вам макет обложки", at: at(1) },
      { id: "m4", direction: "in" as const, text: "Старое обещание: пришлю тексты", at: at(50) },
    ];
    const tasks = [
      { id: "t1", title: "Отправить макет обложки", dueAt: at(30), createdAt: at(40), priority: null, createdById: "s-rasul" },
      { id: "t2", title: "Перезвонить клиенту", dueAt: at(5), createdAt: at(40), priority: null, createdById: "s-rasul" },
      { id: "t3", title: "Напомнить о себе: клиент молчит", dueAt: at(5), createdAt: at(40), priority: null, createdById: null },
      { id: "t4", title: "Обещали клиенту: рассчитать доставку", dueAt: at(10), createdAt: at(40), priority: "high", createdById: null },
    ];
    const review = {
      ...base,
      stage: null,
      promises: [
        { who: "client" as const, what: "прислать фото", due: "2026-11-28", quote: "Фото пришлю к пятнице", message: 1 },
        { who: "manager" as const, what: "перезвонить клиенту", due: null, quote: "завтра перезвоню", message: 2 },
        { who: "client" as const, what: "прислать тексты", due: "2026-11-30", quote: "пришлю тексты", message: 4 },
        { who: "client" as const, what: "оплатить", due: "2026-11-20", quote: "Фото пришлю", message: 1 },
      ],
      done: [{ task: 1, quote: "Отправила вам макет обложки", message: 3 }],
    };
    const { d, calls } = deps(null, {
      config: async () => ({ stages: false, manager: false, tasks: true }),
      candidates: async () => [{ id: "d1", stageId: "work", assigneeId: "s-rasul", order: null, lastIn: at(1), reviewedAt: at(24) }],
      review: async () => ({ review, messages: msgs, tasks }),
    });
    expect(await aiStagesPass(d, now)).toMatchObject({ reviewed: 1, tasks: { created: 2, closed: 1, raised: 1 } });
    expect(calls.tasks).toEqual([
      ["create", { dealId: "d1", title: "Клиент обещал: прислать фото", kind: "task", dueAt: new Date("2026-11-28T05:00:00Z"), assigneeId: "s-rasul" }],
      ["create", { dealId: "d1", title: "Обещали клиенту: перезвонить клиенту", kind: "call", dueAt: new Date("2026-11-28T05:00:00Z"), assigneeId: "s-rasul" }],
      ["done", "t1", "ИИ: сделано — «Отправила вам макет обложки»"],
      // t2 — задача сотрудника, просрочена: поднята; t3 — задача правила, t4 — уже высокий: не трогаем.
      ["raise", "t2"],
    ]);
    expect(calls.notes[0]).toBe("ИИ: задача «Клиент обещал: прислать фото» на 28.11.2026. клиент пообещал — «Фото пришлю к пятнице».");
  });

  it("ошибка модели по одной сделке не останавливает проход", async () => {
    const { d } = deps(null, { review: async () => Promise.reject(new Error("429")) });
    expect(await aiStagesPass(d)).toEqual({ reviewed: 0, applied: 0, proposed: 0, assigned: 0, attributed: 0 });
  });
});

describe("ИИ в CRM: кто менеджер", () => {
  it("имя в тексте — по первым буквам любой части имени, с падежами; чужое имя — нет", () => {
    expect(nameInText("ИндираОП", "Меня зовут Индира")).toBe(true);
    expect(nameInText("ИндираОП", "Индирага рахмет")).toBe(true);
    expect(nameInText("Расул", "менеджер Расул, здравствуйте")).toBe(true);
    expect(nameInText("Margo", "Марат, добрый день")).toBe(false);
    expect(nameInText("Салауат", "Здравствуйте")).toBe(false);
  });

  it("решение: представился сам — сам; клиент назвал — предложение; без имени в цитате — ничего", () => {
    const base = { staffId: "a", assigneeId: "b", quoteOk: true, nameOk: true, fromManager: true };
    expect(aiManagerDecision(base)).toBe("apply");
    expect(aiManagerDecision({ ...base, fromManager: false })).toBe("propose");
    expect(aiManagerDecision({ ...base, nameOk: false })).toBeNull();
    expect(aiManagerDecision({ ...base, quoteOk: false })).toBeNull();
    expect(aiManagerDecision({ ...base, assigneeId: "a", fromManager: false })).toBeNull();
    expect(aiManagerDecision({ ...base, assigneeId: "a" })).toBe("apply");
  });
});

describe("ИИ в CRM: выключатели", () => {
  it("всё выключено по умолчанию; этапы — JSON { on }, остальные — on/off", () => {
    for (const f of AI_CRM_FLAGS) expect(aiFlagOn(f.key, null)).toBe(false);
    expect(aiFlagOn("crm.aiStages", aiFlagValue("crm.aiStages", true))).toBe(true);
    expect(aiFlagOn("crm.aiTranscribe", aiFlagValue("crm.aiTranscribe", true))).toBe(true);
    expect(aiFlagOn("crm.aiTranscribe", aiFlagValue("crm.aiTranscribe", false))).toBe(false);
    expect(parseAiStages(aiFlagValue("crm.aiStages", true))).toEqual({ on: true });
    expect(isAiCrmFlag("crm.aiTranscribe")).toBe(true);
    expect(isAiCrmFlag("ai.apiKey")).toBe(false);
  });
});
