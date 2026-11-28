import { describe, expect, it } from "vitest";
import {
  HELP_EDIT_KINDS,
  HELP_PROPOSAL_TTL_MS,
  editsToRaw,
  editsWithIds,
  editsWithRefs,
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
});

function book(over: Partial<HelpEditBook> = {}): HelpEditBook {
  return {
    status: "draft",
    titlePage: true,
    showToc: true,
    tocAtEnd: false,
    dedication: "",
    chapterStart: "page",
    openersLeft: true,
    chapterSide: "left",
    indent: 1,
    indentFirst: false,
    leadIn: false,
    dropCap: "none",
    interiorStyle: { body: { size: 11 } },
    photos: [photo("p1", "ph-a", "q1"), photo("p2", "ph-b", "q1", { anchor: 2 }), photo("p3", "ph-c", "q2")],
    photoOrder: ["ph-x", "ph-a", "ph-b", "ph-c"],
    pageFit: () => "contain",
    order: null,
    ...over,
  };
}

const raw = (kind: string, value = "", photo = "", target = "") => ({ kind, photo, target, value });

describe("правки помощника: разбор и проверка", () => {
  it("все правки списка разбираются по книге", () => {
    const r = parseHelpEdits(
      [
        raw("titlePage", "off"),
        raw("toc", "off"),
        raw("tocPlace", "end"),
        raw("dedication", "Маме — с любовью"),
        raw("chapterStart", "inline"),
        raw("openersLeft", "off"),
        raw("indent", "1,5"),
        raw("indentFirst", "on"),
        raw("leadIn", "on"),
        raw("dropCap", "drop"),
        raw("photoPage", "on", "p1"),
        raw("photoSize", "large", "p3"),
        raw("photoBreak", "on", "P2"),
      ],
      book(),
    );
    expect(r.problems).toEqual([]);
    expect(r.edits.map((e) => e.kind)).toEqual(["titlePage", "toc", "tocPlace", "dedication", "chapterStart", "openersLeft", "indent", "indentFirst", "leadIn", "dropCap", "photoPage", "photoSize", "photoBreak"]);
    expect(r.edits.find((e) => e.kind === "indent")).toEqual({ kind: "indent", value: 1.5 });
  });

  it("запрещённое и незнакомое — не правка: деньги, заказ, удаление, текст ответа", () => {
    for (const kind of ["discount", "price", "deleteAnswer", "deletePhoto", "answerText", "orderCancel", "title", "coverTemplate"]) {
      const r = parseHelpEdits([raw(kind, "x")], book());
      expect(r.edits, kind).toEqual([]);
      expect(r.problems.join(" "), kind).toMatch(/нет в списке/);
      expect((HELP_EDIT_KINDS as readonly string[]).includes(kind)).toBe(false);
    }
    // Одна запрещённая в пачке — не применяется ни одна.
    expect(parseHelpEdits([raw("titlePage", "off"), raw("deletePhoto", "", "p1")], book()).edits).toEqual([]);
  });

  it("фото — только из ответов этой книги: id чужого фото, несуществующая ссылка, перестановка между ответами", () => {
    expect(parseHelpEdits([raw("photoPage", "on", "ph-zzz-other-book")], book()).problems[0]).toMatch(/нет в списке фото/);
    expect(parseHelpEdits([raw("photoPage", "on", "p9")], book()).problems[0]).toMatch(/нет в списке фото/);
    // Прямой id фото этой книги вместо ссылки тоже не принимается: модель видит только ссылки p1…
    expect(parseHelpEdits([raw("photoPage", "on", "ph-a")], book()).edits).toEqual([]);
    expect(parseHelpEdits([raw("photoMove", "before", "p1", "p3")], book()).problems[0]).toMatch(/внутри одного ответа/);
    expect(parseHelpEdits([raw("photoMove", "before", "p1", "p1")], book()).problems[0]).toMatch(/другое фото/);
  });

  it("«С какой страницы начинается глава»: где выпадет / слева / справа — подпись и план правки", () => {
    const r = parseHelpEdits([raw("chapterSide", "right")], book());
    expect(r.edits).toEqual([{ kind: "chapterSide", value: "right" }]);
    expect(helpEditLines(r.edits, book(), "ru")).toEqual(["С какой страницы начинается глава: Всегда слева → Всегда справа"]);
    expect(planHelpEdits(r.edits, book()).settings).toEqual({ chapterSide: "right" });
    expect(parseHelpEdits([raw("chapterSide", "left")], book()).problems[0]).toMatch(/ничего не меняет/);
    expect(parseHelpEdits([raw("chapterSide", "middle")], book()).problems[0]).toMatch(/auto, left, right/);
  });

  it("значения вне допустимого и пустые", () => {
    expect(parseHelpEdits([raw("indent", "9")], book()).problems[0]).toMatch(/от 0 до 4/);
    expect(parseHelpEdits([raw("titlePage", "maybe")], book()).problems[0]).toMatch(/on или off/);
    expect(parseHelpEdits([raw("chapterStart", "left")], book()).problems[0]).toMatch(/page, inline, none/);
    expect(parseHelpEdits([raw("tocPlace", "middle")], book()).problems[0]).toMatch(/start или end/);
    expect(parseHelpEdits([raw("photoSize", "huge", "p1")], book()).problems[0]).toMatch(/small/);
    expect(parseHelpEdits([raw("dedication", "я".repeat(601))], book()).problems[0]).toMatch(/600/);
    expect(parseHelpEdits([], book()).problems[0]).toMatch(/без правок/);
  });

  it("заказанная книга — правок нет", () => {
    const r = parseHelpEdits([raw("titlePage", "off")], book({ status: "ordered" }));
    expect(r.edits).toEqual([]);
    expect(r.problems.join(" ")).toMatch(/книга заказана/);
  });

  it("правка, которая ничего не меняет, не предлагается", () => {
    expect(parseHelpEdits([raw("titlePage", "on")], book()).problems[0]).toMatch(/уже так/);
    expect(parseHelpEdits([raw("photoMove", "before", "p1", "p2")], book()).problems[0]).toMatch(/уже так/);
    // В пачке лишние отбрасываются, остальные остаются.
    expect(parseHelpEdits([raw("titlePage", "on"), raw("toc", "off")], book()).edits).toEqual([{ kind: "toc", on: false }]);
  });
});

describe("правки помощника: подписи, предупреждение, план", () => {
  it("строки «было → станет» — словами редактора на языке сайта", () => {
    const b = book();
    const { edits } = parseHelpEdits([raw("titlePage", "off"), raw("photoPage", "on", "p2"), raw("photoMove", "before", "p2", "p1"), raw("dedication", "Маме")], b);
    const ru = messagesFor("ru");
    const lines = helpEditLines(edits, b, "ru");
    expect(lines[0]).toBe(`${ru.design.pages.elements.titlePagePrint}: ${ru.help.actions.on} → ${ru.help.actions.off}`);
    expect(lines[1]).toContain(ru.help.actions.photo(2, 2, "Детство"));
    expect(lines[1]).toContain(`${ru.editor.answerPhoto.inText} → ${ru.editor.answerPhoto.onPage}`);
    expect(lines[2]).toContain(`${ru.editor.answerPhoto.orderOf(2, 2)} → ${ru.editor.answerPhoto.orderOf(1, 2)}`);
    expect(lines[3]).toBe(`${ru.books.pages.dedication}: ${ru.help.actions.empty} → «Маме»`);
    const kk = helpEditLines(edits, b, "kk");
    expect(kk[0]).toContain(messagesFor("kk").design.pages.elements.titlePagePrint);
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

  it("оглавление в конце — в стиле страниц (elements.toc), «в начале» убирает ключ", () => {
    const b = book();
    const plan = planHelpEdits(parseHelpEdits([raw("tocPlace", "end")], b).edits, b);
    expect(plan.settings.interiorStyle).toEqual({ body: { size: 11 }, elements: { toc: "end" } });
    const atEnd = book({ tocAtEnd: true, interiorStyle: { elements: { toc: "end" } } });
    expect(planHelpEdits(parseHelpEdits([raw("tocPlace", "start")], atEnd).edits, atEnd).settings.interiorStyle).toEqual({});
    const ru = messagesFor("ru").books.pages;
    expect(helpEditLines(parseHelpEdits([raw("tocPlace", "end")], b).edits, b, "ru")[0]).toBe(`${ru.tocPlace}: ${ru.tocPlaces.start} → ${ru.tocPlaces.end}`);
  });

  it("план: настройки книги, стиль поверх своего, вид фото целиком, порядок фото", () => {
    const b = book();
    const { edits } = parseHelpEdits(
      [raw("titlePage", "off"), raw("indent", "0"), raw("leadIn", "on"), raw("photoPage", "on", "p1"), raw("photoSize", "small", "p1"), raw("photoMove", "after", "p1", "p2")],
      b,
    );
    const plan = planHelpEdits(edits, b);
    expect(plan.settings.titlePage).toBe(false);
    expect(plan.settings.interiorStyle).toEqual({ body: { size: 11, indent: 0 }, elements: { leadIn: true } });
    expect(plan.photos).toHaveLength(1);
    expect(plan.photos[0].id).toBe("ph-a");
    expect(plan.photos[0].patch.inline).toMatchObject({ page: true, pageFit: "contain", width: 33, anchor: 2 });
    expect(plan.order).toEqual(["ph-x", "ph-b", "ph-a", "ph-c"]);
    // Вернуть фото в текст — без отметки страницы.
    const back = book({ photos: [photo("p1", "ph-a", "q1", { page: true, pageFit: "contain" })] });
    expect(planHelpEdits(parseHelpEdits([raw("photoPage", "off", "p1")], back).edits, back).photos[0].patch.inline.page).toBeUndefined();
  });

  it("в журнале — id фото; по свежей книге — снова ссылки, удалённое фото — правка устарела", () => {
    const b = book();
    const { edits } = parseHelpEdits([raw("photoMove", "before", "p2", "p1"), raw("toc", "off")], b);
    const stored = editsWithIds(edits, b);
    expect(stored[0]).toMatchObject({ photo: "ph-b", target: "ph-a" });
    // Свежая книга: ссылки сдвинулись (добавили фото раньше) — правка находит те же фото по id.
    const fresh = book({ photos: [photo("p1", "ph-new", "q0"), photo("p2", "ph-a", "q1"), photo("p3", "ph-b", "q1", { anchor: 2 })] });
    const refs = editsWithRefs(stored, fresh)!;
    expect(refs[0]).toMatchObject({ photo: "p3", target: "p2" });
    expect(parseHelpEdits(editsToRaw(refs), fresh).edits).toHaveLength(2);
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
    for (const k of HELP_EDIT_KINDS) expect(sys).toContain(`- ${k} —`);
    expect(sys).toMatch(/тексты ответов не пишешь и не меняешь никогда/);
    expect(sys).toMatch(/Удалять ответы и фото/);
  });

  it("разбор ответа: propose с правками; у других действий правки отбрасываются", () => {
    const d = parseHelpDecision(JSON.stringify({ language: "ru", action: "propose", handoff_reason: "none", reply: "Могу убрать титул.", suggestions: [], edits: [raw("titlePage", "off")] }));
    expect(d?.action).toBe("propose");
    expect(d?.edits).toHaveLength(1);
    expect(parseHelpDecision(JSON.stringify({ language: "ru", action: "answer", handoff_reason: "none", reply: "Так.", suggestions: [], edits: [raw("titlePage", "off")] }))?.edits).toEqual([]);
  });

  it("блок «Правки за клиента» в запросе: доступны с фото, недоступны с причиной, не с сайта", () => {
    const base = { book: "", history: [], place: null, question: "?", uiLang: "ru" as const };
    expect(helpUserPrompt({ ...base, edits: { available: true, photos: "[p1] в ответе «Детство»" } })).toMatch(/Доступны[\s\S]*\[p1\]/);
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
    expect(stored.edits[1]).toMatchObject({ kind: "photoPage", photo: "ph-b" });
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
