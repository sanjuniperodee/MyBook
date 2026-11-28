import { describe, expect, it } from "vitest";
import { attachmentKind, notificationText, SupportError, ticketRefs, validateNew, type NewTicketInput, type Ticket } from "@/modules/support/domain";
import { TicketsService, type TicketDraft, type TicketFilter, type TicketRepository } from "@/modules/support/application";
import { SUPPORT_STATUSES, type SupportStatus } from "@/shared/domain/support";

const input = (over: Partial<NewTicketInput> = {}): NewTicketInput => ({
  kind: "bug",
  urgency: "normal",
  description: "Текст главы стирается на телефоне",
  place: "",
  expected: "",
  reporterName: "Марат",
  notifyPhone: "8 705 147 90 03",
  clientPhone: "",
  device: "",
  userAgent: "",
  ...over,
});

describe("номера обращений в коммитах", () => {
  it("находит «Обращение №N» в разных написаниях", () => {
    expect(ticketRefs("Редактор: текст не стирается (Обращение №12)")).toEqual([12]);
    expect(ticketRefs("обращения №3, №4 и №15: правки")).toEqual([3, 4, 15]);
    expect(ticketRefs("Обращение 7 — белый шаблон")).toEqual([]);
    expect(ticketRefs("fix support #21")).toEqual([21]);
    expect(ticketRefs("Обращение: №5")).toEqual([5]);
  });

  it("не путает с номерами заказов и пустыми строками", () => {
    expect(ticketRefs("Заказ №72 пересобран")).toEqual([]);
    expect(ticketRefs("")).toEqual([]);
    expect(ticketRefs("Обращение №0")).toEqual([]);
    expect(ticketRefs("Обращение №12\n3 файла")).toEqual([12]);
    expect(ticketRefs("Обращение №12 и 3 проверки")).toEqual([12]);
    expect(ticketRefs("fix: support 2026 login")).toEqual([]);
    expect(ticketRefs("Предобращение №4")).toEqual([]);
  });
});

describe("форма обращения", () => {
  it("номер для уведомления обязателен и нормализуется", () => {
    expect(() => validateNew(input({ notifyPhone: "" }), 0)).toThrow(SupportError);
    expect(validateNew(input(), 0).notifyPhone).toBe("77051479003");
  });

  it("хватает одного голосового без текста, но не пустой формы", () => {
    expect(() => validateNew(input({ description: "  " }), 0)).toThrow(/Опишите/);
    expect(validateNew(input({ description: "" }), 1).description).toBe("");
  });

  it("неизвестный тип и срочность — по умолчанию; короткий телефон клиента отбрасывается", () => {
    const v = validateNew(input({ kind: "hack", urgency: "x", clientPhone: "123" }), 0);
    expect(v.kind).toBe("bug");
    expect(v.urgency).toBe("normal");
    expect(v.clientPhone).toBe("");
  });

  it("голосовые WhatsApp узнаются по расширению, даже без типа", () => {
    expect(attachmentKind("application/octet-stream", "PTT-20261121.opus")).toBe("audio");
    expect(attachmentKind("audio/webm", "голосовое.webm")).toBe("audio");
    expect(attachmentKind("", "screen.mp4")).toBe("video");
    expect(attachmentKind("image/png", "x.png")).toBe("image");
    expect(attachmentKind("application/pdf", "файл.pdf")).toBe("file");
  });
});

describe("уведомление", () => {
  it("закрытое — итог, что сделали и ссылка на новое обращение", () => {
    const text = notificationText({ number: 12, status: "done", resolution: "Текст больше не стирается.", reporterName: "Марат Ахметов" }, "https://mybooks.kz/");
    expect(text).toContain("Здравствуйте, Марат!");
    expect(text).toContain("Обращение №12 в MyBooks: исправили");
    expect(text).toContain("Текст больше не стирается.");
    expect(text).toContain("https://mybooks.kz/admin/support/new");
  });

  it("в работе — без ссылки на новое обращение", () => {
    expect(notificationText({ number: 3, status: "in_progress", resolution: "", reporterName: "" }, "https://mybooks.kz")).toBe("Здравствуйте!\n\nОбращение №3 в MyBooks: в работе.");
  });
});

class MemoryRepo implements TicketRepository {
  rows = new Map<string, Ticket>();
  seq = 0;
  nextId() {
    return `id-${this.seq + 1}`;
  }
  async insert(id: string, draft: TicketDraft) {
    const t: Ticket = { ...draft, id, number: ++this.seq, createdAt: new Date(), updatedAt: new Date() };
    this.rows.set(id, t);
    return t;
  }
  async byId(id: string) {
    return this.rows.get(id) ?? null;
  }
  async byNumber(n: number) {
    return [...this.rows.values()].find((t) => t.number === n) ?? null;
  }
  async byNumbers(ns: number[]) {
    return [...this.rows.values()].filter((t) => ns.includes(t.number));
  }
  async update(id: string, patch: Partial<TicketDraft>) {
    this.rows.set(id, { ...this.rows.get(id)!, ...patch });
  }
  async list(filter: TicketFilter) {
    void filter;
    return [...this.rows.values()];
  }
  async counts(createdBy?: string) {
    void createdBy;
    return Object.fromEntries(SUPPORT_STATUSES.map((s) => [s, 0])) as Record<SupportStatus, number>;
  }
}

function setup(opts: { transcribe?: "ok" | "fail"; send?: boolean } = {}) {
  const repo = new MemoryRepo();
  const files = new Map<string, Buffer>();
  const sent: { phone: string; text: string }[] = [];
  const asked: string[] = [];
  const service = new TicketsService(
    repo,
    { put: async (k, d) => void files.set(k, d), get: async (k) => files.get(k)! },
    {
      transcribe: async () => (opts.transcribe === "fail" ? { error: "OpenRouter: на балансе нет денег" } : { text: "бека брат текст стирается", by: "gemini" }),
      brief: async (req) => {
        asked.push(req.user);
        return "Суть: текст главы стирается.";
      },
    },
    async (data) => ({ data, mime: "audio/ogg" }),
    { send: async (phone, text) => (sent.push({ phone, text }), opts.send ?? true) },
    { created: async () => {} },
    {
      conversation: async (id) => (id === "c1" ? { id, contactName: "Айгерим", chatId: "77010000000" } : null),
      messagesIn: async (_c, ids) =>
        ids.filter((i) => i === "m1" || i === "m2").map((i) => ({ id: i, conversationId: "c1", direction: "in", type: i === "m1" ? "text" : "audio", text: i === "m1" ? "текст стирается" : "🎤 Голосовое сообщение", transcript: null, createdAt: new Date("2026-11-22T10:00:00Z") })),
      mediaBytes: async () => ({ data: new Uint8Array([1, 2]), mime: "audio/ogg" }),
    },
    { now: () => new Date("2026-11-23T10:00:00Z") },
    { info: () => {}, warn: () => {}, error: () => {} },
    "https://mybooks.kz",
  );
  return { repo, files, sent, asked, service };
}

describe("обращения: сценарии", () => {
  it("создаёт обращение с файлами, расшифровывает голосовое и пишет суть", async () => {
    const { service, files, asked } = setup();
    const t = await service.create(input({ description: "" }), [{ name: "PTT.opus", mime: "", data: Buffer.from("ogg"), recorded: false }, { name: "скрин.png", mime: "image/png", data: Buffer.from("png") }], { userId: null, name: "Марат" });
    expect(t.number).toBe(1);
    expect(t.attachments.map((a) => a.kind)).toEqual(["audio", "image"]);
    expect([...files.keys()][0]).toMatch(/^support\/id-1\/1-[a-z0-9]+\.opus$/);
    const done = await service.process(t.id);
    expect(done?.attachments[0].transcript).toBe("бека брат текст стирается");
    expect(done?.attachments[0].transcriptBy).toBe("gemini");
    expect(done?.summary).toBe("Суть: текст главы стирается.");
    expect(asked[0]).toContain("бека брат текст стирается");
  });

  it("сбой расшифровки пишется во вложение, суть всё равно строится", async () => {
    const { service } = setup({ transcribe: "fail" });
    const t = await service.create(input(), [{ name: "v.ogg", mime: "audio/ogg", data: Buffer.from("x") }], { userId: null, name: "" });
    const done = await service.process(t.id);
    expect(done?.attachments[0].transcript).toBeUndefined();
    expect(done?.attachments[0].transcriptError).toContain("нет денег");
    expect(done?.summary).toContain("Суть");
  });

  it("выкатка коммита закрывает обращение и пишет человеку один раз", async () => {
    const { service, repo, sent } = setup();
    const t = await service.create(input(), [], { userId: null, name: "" });
    await service.update(t.id, { resolution: "Исправили сохранение текста." }, { userId: "u", name: "Бекхан" });
    const commits = [{ sha: "a".repeat(40), subject: "Редактор: текст не стирается (Обращение №1)" }];
    expect(await service.released({ release: "20261123-1000-aaaaaaa", commits })).toEqual([{ number: 1, closed: true, notified: true }]);
    const after = (await repo.byId(t.id))!;
    expect(after.status).toBe("done");
    expect(after.commits).toHaveLength(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].phone).toBe("77051479003");
    expect(sent[0].text).toContain("Исправили сохранение текста.");
    // Повторная выкатка того же коммита ничего не дублирует.
    expect(await service.released({ release: "again", commits })).toEqual([]);
    expect(sent).toHaveLength(1);
  });

  it("отклонённое обращение выкатка не открывает и не закрывает заново", async () => {
    const { service, repo, sent } = setup();
    const t = await service.create(input(), [], { userId: null, name: "" });
    await service.update(t.id, { status: "rejected", notify: false }, { userId: "u", name: "Бекхан" });
    expect(await service.released({ release: "r", commits: [{ sha: "b".repeat(40), subject: "Обращение №1" }] })).toEqual([{ number: 1, closed: false, notified: false }]);
    expect((await repo.byId(t.id))!.status).toBe("rejected");
    expect(sent).toHaveLength(0);
  });

  it("закрытие из CRM пишет человеку; ошибка отправки видна в обращении", async () => {
    const { service, repo } = setup({ send: false });
    const t = await service.create(input(), [], { userId: null, name: "" });
    expect(await service.update(t.id, { status: "done" }, { userId: "u", name: "Бекхан" })).toEqual({ notified: false });
    const after = (await repo.byId(t.id))!;
    expect(after.notifyError).toContain("WhatsApp");
    expect(after.history.at(-1)?.text).toContain("не ушло");
  });

  it("переписка клиента: выбранные сообщения, телефон из диалога, голосовое расшифровано, суть с перепиской", async () => {
    const { service, asked } = setup();
    const t = await service.create(input(), [], { userId: null, name: "" });
    const linked = await service.linkChat(t.id, "c1", ["m1", "m2", "чужое"], { userId: "u", name: "Бекхан" });
    expect(linked.chat?.messages.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(linked.clientPhone).toBe("77010000000");
    const done = await service.process(t.id);
    expect(done?.chat?.messages[1].transcript).toBe("бека брат текст стирается");
    expect(asked.at(-1)).toContain("клиент: текст стирается");
    expect(asked.at(-1)).toContain("клиент: (голосовое) бека брат");
    await expect(service.linkChat(t.id, "nope", ["m1"], { userId: "u", name: "Б" })).rejects.toThrow(/Диалог/);
    expect((await service.linkChat(t.id, null, [], { userId: "u", name: "Б" })).chat).toBeNull();
  });

  it("слишком большой файл не принимается", async () => {
    const { service } = setup();
    await expect(service.create(input(), [{ name: "big.mp4", mime: "video/mp4", data: Buffer.alloc(51 * 1024 * 1024) }], { userId: null, name: "" })).rejects.toThrow(/больше 50 МБ/);
  });
});

describe("обращения: разбор помощником по книге", () => {
  it("правки помощника записываются и при повторном разборе заменяются, в истории — строка", async () => {
    const { service, repo } = setup();
    const t = await service.create(input({ description: "ордер 106 убери титул" }), [], { userId: "s1", name: "Марат" });
    expect(t.assist).toBeNull();
    const first = { state: "none" as const, at: "2026-11-23T10:00:00Z", bookId: "b1", bookTitle: "Мама", ownerId: "u1", reply: "", reason: "заказ в печати", edits: [], lines: [], warning: null };
    await service.setAssist(t.id, first, { by: "Помощник", text: "Помощник не может сделать сам" });
    const second = { ...first, state: "proposed" as const, reason: "", edits: [{ kind: "titlePage", ref: "", target: "", value: "off" }], lines: ["Титульный лист: вкл. → выкл."], reopenOrderId: "o1" };
    await service.setAssist(t.id, second, { by: "Помощник", text: "Помощник предлагает правки (1)" });
    const saved = (await repo.byId(t.id))!;
    expect(saved.assist).toMatchObject({ state: "proposed", reopenOrderId: "o1" });
    expect(saved.history.map((h) => h.text)).toEqual(["Обращение создано", "Помощник не может сделать сам", "Помощник предлагает правки (1)"]);
  });
});
