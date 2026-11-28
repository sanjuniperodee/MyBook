import { describe, expect, it } from "vitest";
import {
  HELP_EDIT_KINDS,
  HELP_PROPOSAL_TTL_MS,
  editsToRaw,
  editsWithIds,
  editsWithRefs,
  markAnswer,
  sameWords,
  helpEditLines,
  helpEditWarning,
  parseHelpEdits,
  planHelpEdits,
  type HelpEditBook,
  type HelpEditPlan,
} from "@/modules/messaging/domain/cabinetHelpActions";
import { helpSchema, helpSystemPrompt, helpUserPrompt, parseHelpDecision } from "@/modules/messaging/domain/cabinetHelp";
import { CabinetHelpService, HelpActionError, type HelpProposalRecord, type HelpThreadMessage } from "@/modules/messaging/application/cabinetHelp";
import type { BotSellerModel } from "@/modules/messaging/application";
import type { Conversation } from "@/modules/messaging/domain";
import { defaultInlineStyle } from "@/lib/book/inline-photo";
import { messagesFor } from "@/i18n/messages";

/**
 * Правки книги помощником по просьбе клиента: белый список, проверка по книге (чужое фото, запрещённое действие,
 * заказанная книга), подписи «было → станет», предупреждение о согласованном макете, план для сервисов редактора и
 * сервис — предложение, «Применить» только своим предложением своей книги, повтор, отказ, устаревание.
 */

const photo = (ref: string, id: string, questionId: string, over: Partial<HelpEditBook["photos"][number]["inline"]> = {}) => ({
  ref,
  id,
  questionId,
  heading: questionId === "q1" ? "Детство" : "Свадьба",
  width: 1200,
  height: 1600,
  inline: { ...defaultInlineStyle, width: 50, ...over },
  chapter: null,
  opener: false,
  caption: "",
  layout: "full" as const,
});

function book(over: Partial<HelpEditBook> = {}): HelpEditBook {
  return {
    status: "draft",
    titlePage: true,
    showToc: true,
    tocAtEnd: false,
    tocMode: "chapters",
    titleAuthor: true,
    titleLine: "",
    chapterNumber: "label",
    title: "Мама",
    subtitle: "",
    coverTemplate: true,
    coverLines: true,
    hasRecipient: true,
    hideRecipient: false,
    coverPhotoId: null,
    chapterLeadIn: {},
    chapters: [{ ref: "c1", key: "childhood", title: "Детство" }],
    questions: [
      { ref: "q1", id: "q1", heading: "Детство", pageBreak: false, answer: "Я родилась в ауле.\nМенің баға жетпес байлығым!\nМама пела песни." },
      { ref: "q2", id: "q2", heading: "Свадьба", pageBreak: false, answer: "Свадьба была летом." },
    ],
    dedication: "",
    chapterStart: "page",
    openersLeft: true,
    chapterSide: "left",
    indent: 1,
    indentFirst: false,
    leadIn: false,
    dropCap: "none",
    interiorStyle: { body: { size: 11 } },
    photos: [photo("p1", "ph-a", "q1"), photo("p2", "ph-b", "q1", { anchor: 2 }), photo("p3", "ph-c", "q2"), { ...photo("p4", "ph-d", "q1"), questionId: null, heading: "альбом" }],
    photoOrder: ["ph-x", "ph-a", "ph-b", "ph-c", "ph-d"],
    pageFit: () => "contain",
    order: null,
    ...over,
  };
}

const raw = (kind: string, value = "", ref = "", target = "") => ({ kind, ref, target, value });

describe("правки помощника: разбор и проверка", () => {
  it("правки всех видов разбираются по книге", () => {
    const r = parseHelpEdits(
      [
        raw("titlePage", "off"),
        raw("titleAuthor", "off"),
        raw("titleLine", "Қызы Ләззат"),
        raw("toc", "off"),
        raw("tocPlace", "end"),
        raw("tocMode", "sections"),
        raw("dedication", "Маме — с любовью"),
        raw("chapterStart", "inline"),
        raw("chapterNumber", "none"),
        raw("openersLeft", "off"),
        raw("indent", "1,5"),
        raw("indentFirst", "on"),
        raw("leadIn", "on"),
        raw("dropCap", "drop"),
        raw("bookTitle", ""),
        raw("coverLines", "off"),
        raw("hideRecipient", "on"),
        raw("chapterLeadIn", "on", "c1"),
        raw("questionBreak", "on", "q2"),
        raw("textMark", "Менің баға жетпес байлығым!", "q1", "center"),
        raw("photoPage", "on", "p1"),
        raw("photoSize", "large", "p3"),
        raw("photoShape", "3:4", "p3"),
        raw("photoAlign", "left", "p3"),
        raw("photoKeepSize", "on", "p3"),
        raw("photoBreak", "on", "P2"),
        raw("photoAnchor", "start", "p3"),
        raw("photoCaption", "Анашым Роза", "p4"),
        raw("photoPlace", "opener", "p4", "c1"),
        raw("coverPhoto", "", "p4"),
      ],
      book(),
    );
    expect(r.problems).toEqual([]);
    expect(r.edits).toHaveLength(30);
    expect(r.edits.find((e) => e.kind === "indent")?.value).toBe("1.5");
  });

  it("запрещённое и незнакомое — не правка: деньги, заказ, удаление, текст ответа", () => {
    for (const kind of ["discount", "price", "deleteAnswer", "deletePhoto", "answerText", "orderCancel", "coverDesign", "coverTemplate"]) {
      const r = parseHelpEdits([raw(kind, "x")], book());
      expect(r.edits, kind).toEqual([]);
      expect(r.problems.join(" "), kind).toMatch(/нет в списке/);
      expect((HELP_EDIT_KINDS as readonly string[]).includes(kind)).toBe(false);
    }
    expect(parseHelpEdits([raw("titlePage", "off"), raw("deletePhoto", "", "p1")], book()).edits).toEqual([]);
  });

  it("ссылки — только этой книги: чужое фото, несуществующий ответ и глава; вид фото — только у фото в ответе", () => {
    expect(parseHelpEdits([raw("photoPage", "on", "ph-zzz-other-book")], book()).problems[0]).toMatch(/нет в списке фото/);
    expect(parseHelpEdits([raw("photoPage", "on", "ph-a")], book()).edits).toEqual([]);
    expect(parseHelpEdits([raw("questionBreak", "on", "q9")], book()).problems[0]).toMatch(/нет в списке ответов/);
    expect(parseHelpEdits([raw("chapterLeadIn", "on", "c9")], book()).problems[0]).toMatch(/нет в списке глав/);
    expect(parseHelpEdits([raw("photoSize", "large", "p4")], book()).problems[0]).toMatch(/не в ответе/);
    expect(parseHelpEdits([raw("photoMove", "before", "p1", "p1")], book()).problems[0]).toMatch(/другое фото/);
    expect(parseHelpEdits([raw("photoMove", "before", "p1", "p4")], book()).problems[0]).toMatch(/фото в ответе/);
    expect(parseHelpEdits([raw("photoPlace", "", "p1", "somewhere")], book()).problems[0]).toMatch(/target/);
  });

  it("«С какой страницы начинается глава»: где выпадет / слева / справа — подпись и план правки", () => {
    const r = parseHelpEdits([raw("chapterSide", "right")], book());
    expect(r.edits).toEqual([{ kind: "chapterSide", ref: "", target: "", value: "right" }]);
    expect(helpEditLines(r.edits, book(), "ru")).toEqual(["С какой страницы начинается глава: Всегда слева → Всегда справа"]);
    expect(planHelpEdits(r.edits, book()).settings).toEqual({ chapterSide: "right" });
    expect(parseHelpEdits([raw("chapterSide", "left")], book()).problems[0]).toMatch(/ничего не меняет/);
    expect(parseHelpEdits([raw("chapterSide", "middle")], book()).problems[0]).toMatch(/auto, left, right/);
  });

  it("значения вне допустимого и пустые", () => {
    expect(parseHelpEdits([raw("indent", "9")], book()).problems[0]).toMatch(/от 0 до 4/);
    expect(parseHelpEdits([raw("titlePage", "maybe")], book()).problems[0]).toMatch(/on или off/);
    expect(parseHelpEdits([raw("chapterStart", "left")], book()).problems[0]).toMatch(/page, inline, none/);
    expect(parseHelpEdits([raw("tocPlace", "middle")], book()).problems[0]).toMatch(/start, end/);
    expect(parseHelpEdits([raw("photoSize", "huge", "p1")], book()).problems[0]).toMatch(/small/);
    expect(parseHelpEdits([raw("dedication", "я".repeat(601))], book()).problems[0]).toMatch(/600/);
    expect(parseHelpEdits([raw("titleLine", "я".repeat(81))], book()).problems[0]).toMatch(/80/);
    expect(parseHelpEdits([raw("photoAnchor", "7", "p1")], book()).problems[0]).toMatch(/номер абзаца от 1 до 3/);
    expect(parseHelpEdits([], book()).problems[0]).toMatch(/без правок/);
  });

  it("заказанная книга — правок нет; обложка конструктора — без линий, получателя и фото обложки", () => {
    expect(parseHelpEdits([raw("titlePage", "off")], book({ status: "ordered" })).problems.join(" ")).toMatch(/книга заказана/);
    expect(parseHelpEdits([raw("coverLines", "off")], book({ coverTemplate: false })).problems[0]).toMatch(/Конструктор/);
    expect(parseHelpEdits([raw("hideRecipient", "on")], book({ hasRecipient: false })).problems[0]).toMatch(/получателя/);
  });

  it("правка, которая ничего не меняет, не предлагается", () => {
    expect(parseHelpEdits([raw("titlePage", "on")], book()).problems[0]).toMatch(/уже так/);
    expect(parseHelpEdits([raw("photoMove", "before", "p1", "p2")], book()).problems[0]).toMatch(/уже так/);
    expect(parseHelpEdits([raw("titlePage", "on"), raw("toc", "off")], book()).edits).toEqual([{ kind: "toc", ref: "", target: "", value: "off" }]);
  });
});

describe("правки помощника: пометки в тексте ответа — слова те же", () => {
  const answer = "Я родилась в ауле.\nМенің баға жетпес байлығым!\nМенің анам — менің әлемім.\nМама пела песни.";
  it("по центру, капитель и жирная строка ставятся, слова не меняются", () => {
    const c = markAnswer(answer, "center", "Менің баға жетпес байлығым!\nМенің анам — менің әлемім.")!;
    expect(c).toContain(">> Менің баға жетпес байлығым! <<");
    expect(c).toContain(">> Менің анам — менің әлемім. <<");
    const l = markAnswer(answer, "lead", "Мама пела")!;
    expect(l).toContain("^^Мама пела^^ песни.");
    const b = markAnswer(answer, "bold", "Я родилась в ауле.")!;
    expect(b.split("\n")[0]).toBe("**Я родилась в ауле.**");
    for (const x of [c, l, b]) expect(sameWords(answer, x)).toBe(true);
  });
  it("строки нет дословно — null; другое слово — не те же слова", () => {
    expect(markAnswer(answer, "center", "Менің байлығым")).toBeNull();
    expect(sameWords(answer, answer.replace("ауле", "городе"))).toBe(false);
    expect(parseHelpEdits([raw("textMark", "Такой строки нет", "q1", "center")], book()).problems[0]).toMatch(/нет такой строки/);
    expect(parseHelpEdits([raw("textMark", "Мама пела песни.", "q1", "italic")], book()).problems[0]).toMatch(/center, lead, bold/);
  });
  it("план: ответ с пометкой — через QuestionsService.edit, слова те же", () => {
    const b = book();
    const plan = planHelpEdits(parseHelpEdits([raw("textMark", "Менің баға жетпес байлығым!", "q1", "center"), raw("questionBreak", "on", "q1")], b).edits, b);
    expect(plan.questions).toHaveLength(1);
    expect(plan.questions[0].patch.pageBreak).toBe(true);
    expect(sameWords(b.questions[0].answer, plan.questions[0].patch.answer!)).toBe(true);
  });
});

describe("правки помощника: подписи, предупреждение, план", () => {
  it("строки «было → станет» — словами редактора на языке сайта", () => {
    const b = book();
    const { edits } = parseHelpEdits([raw("titlePage", "off"), raw("photoPage", "on", "p2"), raw("photoMove", "before", "p2", "p1"), raw("dedication", "Маме"), raw("photoPlace", "", "p4", "off")], b);
    const ru = messagesFor("ru");
    const lines = helpEditLines(edits, b, "ru");
    expect(lines[0]).toBe(`${ru.design.pages.elements.titlePagePrint}: ${ru.help.actions.on} → ${ru.help.actions.off}`);
    expect(lines[1]).toContain(ru.help.actions.photo(2, 2, "Детство"));
    expect(lines[1]).toContain(`${ru.editor.answerPhoto.inText} → ${ru.editor.answerPhoto.onPage}`);
    expect(lines[2]).toContain(`${ru.editor.answerPhoto.orderOf(2, 2)} → ${ru.editor.answerPhoto.orderOf(1, 2)}`);
    expect(lines[3]).toBe(`${ru.books.pages.dedication}: ${ru.help.actions.empty} → «Маме»`);
    expect(lines[4]).toContain(`→ ${ru.editor.photoPlace.off}`);
    expect(helpEditLines(edits, b, "kk")[0]).toContain(messagesFor("kk").design.pages.elements.titlePagePrint);
    // Все виды правок дают строку без исключений на всех языках.
    const all = parseHelpEdits([raw("tocMode", "both"), raw("chapterNumber", "none"), raw("photoShape", "1:1", "p1"), raw("photoAnchor", "2", "p1"), raw("photoCaption", "Мама", "p4"), raw("coverPhoto", "", "p4"), raw("chapterLeadIn", "on", "c1")], b).edits;
    for (const lang of ["ru", "kk", "uz", "en"] as const) expect(helpEditLines(all, b, lang).every((l) => l.length > 5)).toBe(true);
  });

  it("предупреждение: согласованный макет, заказ ждёт согласования, отменённый и без заказа — нет", () => {
    const t = messagesFor("ru").help.actions;
    const at = new Date("2026-11-27T10:00:00Z");
    expect(helpEditWarning({ status: "paid", approvalRequired: true, approvedAt: at, revokedAt: null }, "ru")).toBe(t.warnApproved);
    expect(helpEditWarning({ status: "paid", approvalRequired: true, approvedAt: null, revokedAt: null }, "ru")).toBe(t.warnOrder);
    expect(helpEditWarning({ status: "in_production", approvalRequired: true, approvedAt: null, revokedAt: at }, "ru")).toBe(t.warnOrder);
    expect(helpEditWarning({ status: "cancelled", approvalRequired: true, approvedAt: at, revokedAt: null }, "ru")).toBeNull();
    expect(helpEditWarning({ status: "delivered", approvalRequired: false, approvedAt: null, revokedAt: null }, "ru")).toBeNull();
    expect(helpEditWarning(null, "ru")).toBeNull();
  });

  it("план: настройки книги, стиль поверх своего, вид фото целиком, порядок и место фото", () => {
    const b = book();
    const { edits } = parseHelpEdits(
      [raw("titlePage", "off"), raw("indent", "0"), raw("leadIn", "on"), raw("tocPlace", "end"), raw("chapterNumber", "none"), raw("titleLine", "Қызы"), raw("chapterLeadIn", "on", "c1"), raw("photoPage", "on", "p1"), raw("photoSize", "small", "p1"), raw("photoMove", "after", "p1", "p2"), raw("photoPlace", "", "p3", "off"), raw("coverPhoto", "", "p4")],
      b,
    );
    const plan = planHelpEdits(edits, b);
    expect(plan.settings.titlePage).toBe(false);
    expect(plan.settings.coverPhotoId).toBe("ph-d");
    expect(plan.settings.interiorStyle).toEqual({ body: { size: 11, indent: 0 }, elements: { leadIn: true, toc: "end", number: "none", titleLine: "Қызы" }, chapters: { childhood: { leadIn: true } } });
    const a = plan.photos.find((x) => x.id === "ph-a")!;
    expect(a.patch.inline).toMatchObject({ page: true, pageFit: "contain", width: 33, anchor: 2 });
    expect(plan.photos.find((x) => x.id === "ph-c")!.patch).toMatchObject({ questionId: null, chapter: "__off", opener: false, inline: null });
    expect(plan.order).toEqual(["ph-x", "ph-b", "ph-a", "ph-c", "ph-d"]);
    const back = book({ photos: [photo("p1", "ph-a", "q1", { page: true, pageFit: "contain" })] });
    expect(planHelpEdits(parseHelpEdits([raw("photoPage", "off", "p1")], back).edits, back).photos[0].patch.inline?.page).toBeUndefined();
  });

  it("фото в другой ответ: рядом с фото того ответа; фото не из ответа — в ответ q…", () => {
    const b = book();
    const move = planHelpEdits(parseHelpEdits([raw("photoMove", "before", "p1", "p3")], b).edits, b);
    expect(move.photos[0]).toMatchObject({ id: "ph-a", patch: { questionId: "q2" } });
    expect(move.order).toEqual(["ph-x", "ph-b", "ph-a", "ph-c", "ph-d"]);
    const into = planHelpEdits(parseHelpEdits([raw("photoPlace", "", "p4", "q2")], b).edits, b);
    expect(into.photos[0]).toMatchObject({ id: "ph-d", patch: { questionId: "q2" } });
  });

  it("в журнале — id; по свежей книге — снова ссылки, удалённое фото — правка устарела", () => {
    const b = book();
    const { edits } = parseHelpEdits([raw("photoMove", "before", "p2", "p1"), raw("toc", "off"), raw("photoPlace", "", "p4", "q2"), raw("questionBreak", "on", "q2")], b);
    const stored = editsWithIds(edits, b);
    expect(stored[0]).toMatchObject({ ref: "ph-b", target: "ph-a" });
    expect(stored[2]).toMatchObject({ ref: "ph-d", target: "q2" });
    const fresh = book({ photos: [photo("p1", "ph-new", "q2"), photo("p2", "ph-a", "q1"), photo("p3", "ph-b", "q1", { anchor: 2 }), { ...photo("p4", "ph-d", "q1"), questionId: null }] });
    const refs = editsWithRefs(stored, fresh)!;
    expect(refs[0]).toMatchObject({ ref: "p3", target: "p2" });
    expect(parseHelpEdits(editsToRaw(refs), fresh).edits).toHaveLength(4);
    expect(editsWithRefs(stored, book({ photos: [photo("p1", "ph-a", "q1")] }))).toBeNull();
  });
});

describe("правки помощника: модель", () => {
  it("схема ответа — с propose и edits, инструкция — со списком правок и запретами", () => {
    const s = helpSchema();
    expect(s.properties.action.enum).toContain("propose");
    expect(s.properties.edits.items.properties.kind.enum).toEqual([...HELP_EDIT_KINDS]);
    expect(s.required).toContain("edits");
    const sys = helpSystemPrompt("ru");
    for (const k of HELP_EDIT_KINDS) expect(sys, k).toMatch(new RegExp(`(- |; |/ )${k} (—|/)`));
    expect(sys).toMatch(/Слова ответов ты не пишешь и не меняешь никогда/);
    expect(sys).toMatch(/Удалять ответы и фото/);
  });

  it("разбор ответа: propose с правками; у других действий правки отбрасываются", () => {
    const d = parseHelpDecision(JSON.stringify({ language: "ru", action: "propose", handoff_reason: "none", reply: "Могу убрать титул.", suggestions: [], edits: [raw("titlePage", "off")] }));
    expect(d?.action).toBe("propose");
    expect(d?.edits).toHaveLength(1);
    expect(parseHelpDecision(JSON.stringify({ language: "ru", action: "answer", handoff_reason: "none", reply: "Так.", suggestions: [], edits: [raw("titlePage", "off")] }))?.edits).toEqual([]);
  });

  it("блок «Правки за клиента» в запросе: доступны с книгой для правок, недоступны с причиной, не с сайта", () => {
    const base = { book: "", history: [], place: null, question: "?", uiLang: "ru" as const };
    expect(helpUserPrompt({ ...base, edits: { available: true, photos: "[p1] в ответе «Детство»" } })).toMatch(/Доступны[\s\S]*Книга для правок[\s\S]*\[p1\]/);
    expect(helpUserPrompt({ ...base, edits: { available: false, why: "книга заказана" } })).toMatch(/Недоступны: книга заказана/);
    expect(helpUserPrompt(base)).toMatch(/Недоступны: клиент пишет не с сайта/);
  });
});

// ─── сервис ────────────────────────────────────────────────────────────────

function harness(opts: { script: unknown[]; book?: HelpEditBook }) {
  let now = new Date("2026-11-28T09:00:00Z");
  const convs = new Map<string, Conversation>();
  const msgs: (HelpThreadMessage & { conv: string })[] = [];
  const events: { conv: string; kind: "proposed" | "settled"; rec?: HelpProposalRecord; id?: string; state?: string; meta?: Record<string, unknown> }[] = [];
  const calls = { user: [] as string[], logs: [] as { reason: string }[], applied: [] as HelpEditPlan[], notify: 0 };
  const script = [...opts.script];
  let current = opts.book ?? book();
  const model: BotSellerModel = {
    configured: async () => true,
    complete: async (req) => {
      calls.user.push(req.user);
      const next = script.shift();
      if (!next) throw new Error("сценарий кончился");
      return { text: JSON.stringify(next), served: null };
    },
  };
  let n = 0;
  const service = new CabinetHelpService({
    conversations: {
      findByChat: async (_c, _ch, chatId) => [...convs.values()].find((c) => c.chatId === chatId) ?? null,
      create: async (input) => {
        const c = { ...input, id: `c${++n}`, dealId: null, assigneeId: null, botStep: null, awaitingSince: null, status: "open" } as Conversation;
        convs.set(c.id, c);
        return c;
      },
      setStatus: async () => {},
      recordHistory: async () => {},
      recordIncoming: async () => {},
      setAssignee: async () => {},
      latestWhatsappOfClient: async () => null,
    },
    messages: {
      insertIncoming: async (conv, m) => (msgs.push({ conv, id: `m${msgs.length + 1}`, from: "client", text: m.text, at: m.at.toISOString() }), true),
      lastOutgoing: async () => ({ auto: null, human: null }),
    },
    chats: {
      send: async (conv, text) => {
        msgs.push({ conv, id: `m${msgs.length + 1}`, from: "bot", text, at: now.toISOString() });
        return { id: `m${msgs.length}` };
      },
      addInternalNote: async () => {},
    },
    model,
    store: {
      thread: async (conv, limit) => msgs.filter((m) => m.conv === conv).slice(-limit),
      log: async (_c, e) => void calls.logs.push(e),
      spentSince: async () => 0,
      propose: async (conv, p) => void events.push({ conv, kind: "proposed", rec: { ...p, state: "pending", createdAt: now } }),
      proposal: async (conv, id) => {
        const rec = events.find((e) => e.conv === conv && e.kind === "proposed" && e.rec!.id === id)?.rec;
        if (!rec) return null;
        const settled = events.find((e) => e.conv === conv && e.kind === "settled" && e.id === id);
        return { ...rec, state: (settled?.state as HelpProposalRecord["state"]) ?? "pending" };
      },
      proposals: async (conv) =>
        events
          .filter((e) => e.conv === conv && e.kind === "proposed")
          .map((e) => ({ ...e.rec!, state: (events.find((x) => x.kind === "settled" && x.id === e.rec!.id)?.state as HelpProposalRecord["state"]) ?? "pending" })),
      settle: async (conv, id, state, meta) => void events.push({ conv, kind: "settled", id, state, meta }),
    },
    sales: { findOpenDeal: async () => null },
    notifier: { notify: async () => void calls.notify++ },
    live: { chatChanged: () => {}, notificationsChanged: () => {} },
    clock: { now: () => now },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    chatId: (u) => `help-${u}`,
    uuid: () => `id${++n}`,
  });
  const editor = {
    state: async () => current,
    apply: async (plan: HelpEditPlan) => void calls.applied.push(plan),
  };
  const ask = (edit: Parameters<typeof service.ask>[0]["edit"] = { book: current, photos: "[p1] в ответе «Детство»" }) =>
    service.ask({ user: { id: "u1", name: "Аружан" }, book: { id: "b1", title: "Мама" }, bookText: "Название: «Мама».", question: "Уберите титульный лист", place: null, uiLang: "ru", edit });
  const apply = (proposalId: string, o: { user?: string; book?: string; decline?: boolean } = {}) =>
    service.apply({ user: { id: o.user ?? "u1" }, book: { id: o.book ?? "b1" }, proposalId, decline: o.decline, uiLang: "ru", editor });
  return {
    service,
    ask,
    apply,
    calls,
    msgs,
    events,
    setBook: (b: HelpEditBook) => (current = b),
    later: (ms: number) => (now = new Date(now.getTime() + ms)),
  };
}

const propose = (edits: unknown[], reply = "Могу выключить титульный лист — нажмите «Применить» под сообщением.") => ({ language: "ru", action: "propose", handoff_reason: "none", reply, suggestions: [], edits });

describe("правки помощника: сервис", () => {
  it("предложение: карточка с «было → станет», в журнале — id фото, книга не меняется до «Применить»", async () => {
    const t = harness({ script: [propose([raw("titlePage", "off"), raw("photoPage", "on", "p2")])] });
    const r = await t.ask();
    expect(r.outcome).toBe("answered");
    expect(r.proposal?.state).toBe("pending");
    expect(r.proposal?.lines).toHaveLength(2);
    expect(t.calls.applied).toEqual([]);
    const stored = t.events[0].rec!;
    expect(stored.edits[1]).toMatchObject({ kind: "photoPage", ref: "ph-b" });
    expect(stored.userId).toBe("u1");
    expect(stored.bookId).toBe("b1");
    expect(t.calls.logs.at(-1)?.reason).toBe("propose");
    // Карточка — у сообщения помощника в беседе.
    const bot = r.messages.find((m) => m.from === "bot")!;
    expect(bot.action?.id).toBe(r.proposal?.id);
    expect(t.calls.user[0]).toMatch(/## Правки за клиента\nДоступны/);
  });

  it("«Применить»: правки штатными сервисами, сообщение «Готово», повторное нажатие ничего не делает", async () => {
    const t = harness({ script: [propose([raw("titlePage", "off")])] });
    const r = await t.ask();
    const a = await t.apply(r.proposal!.id);
    expect(a.proposal?.state).toBe("applied");
    expect(t.calls.applied).toHaveLength(1);
    expect(t.calls.applied[0].settings).toEqual({ titlePage: false });
    expect(t.msgs.at(-1)?.text).toContain(messagesFor("ru").help.actions.done);
    expect(t.events.at(-1)).toMatchObject({ kind: "settled", state: "applied" });
    const again = await t.apply(r.proposal!.id);
    expect(again.proposal?.state).toBe("applied");
    expect(t.calls.applied).toHaveLength(1);
  });

  it("чужой клиент или другая книга не применят предложение", async () => {
    const t = harness({ script: [propose([raw("titlePage", "off")])] });
    const r = await t.ask();
    await expect(t.apply(r.proposal!.id, { user: "u2" })).rejects.toBeInstanceOf(HelpActionError);
    await expect(t.apply(r.proposal!.id, { book: "b2" })).rejects.toBeInstanceOf(HelpActionError);
    await expect(t.apply("no-such")).rejects.toBeInstanceOf(HelpActionError);
    expect(t.calls.applied).toEqual([]);
  });

  it("книгу заказали после предложения — bookLocked, правка не применяется", async () => {
    const t = harness({ script: [propose([raw("titlePage", "off")])] });
    const r = await t.ask();
    t.setBook(book({ status: "ordered" }));
    await expect(t.apply(r.proposal!.id)).rejects.toMatchObject({ code: "bookLocked" });
    expect(t.calls.applied).toEqual([]);
    expect(t.events.at(-1)).toMatchObject({ state: "failed" });
  });

  it("«Не нужно», устаревшее предложение и удалённое фото — без правки", async () => {
    const t = harness({ script: [propose([raw("titlePage", "off")]), propose([raw("toc", "off")]), propose([raw("photoBreak", "on", "p1")])] });
    const declined = await t.ask();
    expect((await t.apply(declined.proposal!.id, { decline: true })).proposal?.state).toBe("declined");
    const old = await t.ask();
    t.later(HELP_PROPOSAL_TTL_MS + 1);
    expect((await t.apply(old.proposal!.id)).proposal?.state).toBe("expired");
    const gone = await t.ask();
    t.setBook(book({ photos: [photo("p1", "ph-b", "q1")] }));
    expect((await t.apply(gone.proposal!.id)).proposal?.state).toBe("expired");
    expect(t.calls.applied).toEqual([]);
  });

  it("книга заказана или клиент не с сайта: модель предложила правку — повтор, затем менеджеру (edit)", async () => {
    const t = harness({ script: [propose([raw("titlePage", "off")]), propose([raw("titlePage", "off")])] });
    const r = await t.ask({ unavailable: "книга заказана — правки в кабинете закрыты" });
    expect(r.outcome).toBe("handoff");
    expect(r.handoff).toBe("edit");
    expect(r.proposal).toBeNull();
    expect(t.calls.user[1]).toMatch(/правки за клиента недоступны/);
    expect(t.events).toEqual([]);
  });

  it("запрещённая правка от модели — повтор с замечанием; исправилась — обычный ответ", async () => {
    const t = harness({
      script: [propose([raw("deleteAnswer", "q1")]), { language: "ru", action: "handoff", handoff_reason: "edit", reply: "Удалить ответ может только менеджер — передаю.", suggestions: [], edits: [] }],
    });
    const r = await t.ask();
    expect(t.calls.user[1]).toMatch(/нет в списке/);
    expect(r.outcome).toBe("handoff");
    expect(t.events).toEqual([]);
  });
});

// ─── обращения в поддержку ─────────────────────────────────────────────────

describe("правки помощника: обращения в поддержку", () => {
  it("номера заказов и телефоны клиента — из текста обращений как их пишут сотрудники", async () => {
    const { orderNumbersIn, phonesIn } = await import("@/server/helpBook");
    expect(orderNumbersIn("Готовый заказ 106 ордер убери там название книги")).toEqual([106]);
    expect(orderNumbersIn("Клиентка Айгерим, под номером 107 order")).toEqual([107]);
    expect(orderNumbersIn("Ордер N124, есть полупустые страницы такие как 8,10,11")).toEqual([124]);
    expect(orderNumbersIn("заказ №93")).toEqual([93]);
    expect(orderNumbersIn("фото на 23странице можешь чуть ниже")).toEqual([]);
    expect(phonesIn("+7 747 222 4140 разбери полностью чат")).toEqual(["77472224140"]);
    expect(phonesIn("+7 705 988 8686 Данный клиент")).toEqual(["77059888686"]);
  });

  function draftHarness(script: unknown[]) {
    const calls: string[] = [];
    const service = new CabinetHelpService({
      conversations: {} as never,
      messages: {} as never,
      chats: {} as never,
      model: {
        configured: async () => true,
        complete: async (req) => {
          calls.push(req.user);
          const next = script.shift();
          if (!next) throw new Error("сценарий кончился");
          return { text: JSON.stringify(next), served: null };
        },
      },
      store: { spentSince: async () => 0 } as never,
      sales: {} as never,
      notifier: {} as never,
      live: {} as never,
      clock: { now: () => new Date("2026-11-28T09:00:00Z") },
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      chatId: (u) => `help-${u}`,
      uuid: () => "x",
    });
    return { service, calls };
  }

  it("обращение про правку из списка — правки для сотрудника; инструкция «кто пишет» — сотрудник", async () => {
    const t = draftHarness([propose([raw("titlePage", "off"), raw("chapterNumber", "none")], "Выключу титульный лист и номера глав.")]);
    const d = await t.service.draft({ bookText: "Название: «Мама».", question: "Описание:\nОрдер 106 убери название книги и нумерацию глав", edit: { book: book(), photos: "[c1] Глава «Детство»" } });
    expect(d.action).toBe("propose");
    expect(d.edits.map((e) => e.kind)).toEqual(["titlePage", "chapterNumber"]);
    expect(t.calls[0]).toMatch(/обращение сотрудника MyBooks в поддержку/);
    expect(t.calls[0]).toMatch(/Ордер 106/);
  });

  it("вне списка или книга заказана — правок нет, причина для сотрудника", async () => {
    const out = draftHarness([{ language: "ru", action: "handoff", handoff_reason: "bug", reply: "Микрофон — это сбой сайта, правками книги не решить.", suggestions: [], edits: [] }]);
    const d = await out.service.draft({ bookText: "", question: "Не работает микрофон", edit: { book: book(), photos: "" } });
    expect(d).toMatchObject({ action: "handoff", edits: [], reply: expect.stringMatching(/сбой/) });
    const locked = draftHarness([propose([raw("titlePage", "off")])]);
    const l = await locked.service.draft({ bookText: "", question: "убери титул", edit: { unavailable: "книга заказана" } });
    expect(l.edits).toEqual([]);
    expect(locked.calls[0]).toMatch(/Недоступны: книга заказана/);
  });

  it("правки не прошли проверку дважды — без правок, с причиной", async () => {
    const t = draftHarness([propose([raw("deletePhoto", "", "p1")]), propose([raw("deletePhoto", "", "p1")])]);
    const d = await t.service.draft({ bookText: "", question: "удали повторы фото", edit: { book: book(), photos: "" } });
    expect(d.edits).toEqual([]);
    expect(d.failure).toMatch(/нет в списке/);
    expect(t.calls[1]).toMatch(/Исправь прошлый вариант/);
  });
});

describe("правки по обращению: заказанная книга", () => {
  it("до печати помощник откроет книгу сам, в печати и дальше — к менеджеру", async () => {
    const { ticketBookAccess } = await import("@/server/helpBook");
    const order = (over: Record<string, unknown>) => ({ id: "o1", status: "paid" as const, layoutApprovalRequired: true, layoutApprovedAt: null, printedAt: null, ...over });
    expect(ticketBookAccess("draft", null)).toEqual({ kind: "open" });
    expect(ticketBookAccess("ordered", order({}))).toEqual({ kind: "reopen", orderId: "o1" }); // ждёт согласования
    expect(ticketBookAccess("ordered", order({ layoutApprovedAt: new Date() }))).toEqual({ kind: "reopen", orderId: "o1" }); // в очереди на печать
    expect(ticketBookAccess("ordered", order({ status: "pending_payment" }))).toEqual({ kind: "reopen", orderId: "o1" });
    expect(ticketBookAccess("ordered", order({ status: "in_production" }))).toEqual({ kind: "locked", stage: "printing" });
    expect(ticketBookAccess("ordered", order({ status: "in_production", printedAt: new Date() }))).toEqual({ kind: "locked", stage: "printed" });
    expect(ticketBookAccess("ordered", order({ status: "shipped" }))).toEqual({ kind: "locked", stage: "shipped" });
    expect(ticketBookAccess("ordered", order({ status: "cancelled" }))).toEqual({ kind: "locked", stage: null });
    expect(ticketBookAccess("ordered", null)).toEqual({ kind: "locked", stage: null });
  });

  it("вид фото после главы на отдельной странице: до краёв, два или четыре на странице", () => {
    const b = book();
    const r = parseHelpEdits([raw("photoLayout", "bleed", "p4")], b);
    expect(planHelpEdits(r.edits, b).photos[0]).toMatchObject({ id: "ph-d", patch: { layout: "bleed" } });
    const ed = messagesFor("ru").editor.placeSheet;
    expect(helpEditLines(r.edits, b, "ru")[0]).toContain(`${ed.layoutTitle}: ${ed.layouts.full} → ${ed.layouts.bleed}`);
    expect(parseHelpEdits([raw("photoLayout", "bleed", "p1")], b).problems[0]).toMatch(/в ответе/);
  });

  it("в кабинете у клиента правило прежнее: заказанную книгу помощник не правит", () => {
    expect(parseHelpEdits([raw("titlePage", "off")], book({ status: "ordered" })).problems.join(" ")).toMatch(/книга заказана/);
  });
});
