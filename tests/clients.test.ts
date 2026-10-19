import { describe, expect, it } from "vitest";
import { ClientsError } from "@/modules/clients/domain";
import { TasksService } from "@/modules/clients/application";
import { head, lead, manager, setup } from "./doubles/clients";

describe("ClientsService: профиль клиента", () => {
  it("ответственный — только действующий сотрудник; снять можно без проверки", async () => {
    const t = setup();
    const client = (await t.clients.find("client-1"))!;
    await t.clients.setManager(client, "m1");
    expect(t.mem.clients.rows.get("client-1")?.managerId).toBe("m1");
    // отключённый и неизвестный — «Сотрудник не найден», ответственный прежний
    for (const id of ["x1", "nobody"]) await expect(t.clients.setManager(client, id)).rejects.toMatchObject({ code: "staffNotFound", message: "Сотрудник не найден" });
    const err = await t.clients.setManager(client, "x1").catch((e: unknown) => e);
    expect(ClientsError.is(err)).toBe(true);
    expect(t.mem.clients.rows.get("client-1")?.managerId).toBe("m1");
    await t.clients.setManager(client, null);
    expect(t.mem.clients.rows.get("client-1")?.managerId).toBeNull();
    expect(t.staff.checked).toEqual(["m1", "x1", "nobody", "x1"]);
    expect(await t.clients.find("nobody")).toBeNull();
  });

  it("доп. телефоны: нормализованы, без основного номера, мусора и повторов, не больше пяти", async () => {
    const t = setup();
    const client = (await t.clients.find("client-1"))!;
    const raw = "8 701 111 22 33; +7 (701) 000-00-00\n7011112233, 123, 87022223344,87033334455,87044445566,87055556677,87066667788";
    const phones = ["77011112233", "77022223344", "77033334455", "77044445566", "77055556677"];
    expect(await t.clients.setExtraPhones(client, raw)).toEqual(phones);
    expect(t.mem.clients.extraPhones.get("client-1")).toEqual(phones);
    // пустая строка очищает список
    expect(await t.clients.setExtraPhones(client, "")).toEqual([]);
    expect(t.mem.clients.extraPhones.get("client-1")).toEqual([]);
  });

  it("теги: обрезаны, в нижнем регистре, без пустых и повторов, не больше 20", async () => {
    const t = setup();
    expect(await t.clients.setTags("client-1", [" VIP ", "vip", "Свадьба", "", "  "])).toEqual(["vip", "свадьба"]);
    expect(t.mem.clients.tags.get("client-1")).toEqual(["vip", "свадьба"]);
    const many = Array.from({ length: 25 }, (_, i) => `t${i}`);
    expect(await t.clients.setTags("client-1", many)).toEqual(many.slice(0, 20));
  });

  it("свои поля и источник пишутся как есть; источник можно снять", async () => {
    const t = setup();
    const client = (await t.clients.find("client-1"))!;
    await t.clients.setCustomFields(client, { city: "Алматы", kids: 2, vip: true, note: null });
    await t.clients.setSource("client-1", { source: "instagram", medium: "manual" });
    expect(t.mem.clients.rows.get("client-1")).toMatchObject({ customFields: { city: "Алматы", kids: 2, vip: true, note: null }, source: { source: "instagram", medium: "manual" } });
    await t.clients.setSource("client-1", null);
    expect(t.mem.clients.rows.get("client-1")?.source).toBeNull();
  });
});

describe("TasksService: задачи менеджеров", () => {
  it("правка задачи: заголовок, срок и напоминание (новое напоминание придёт), результат", async () => {
    const t = setup();
    t.mem.tasks.seed({ id: "t1", assigneeId: "m1", dueAt: new Date("2026-10-20T13:00:00Z") });
    t.mem.tasks.rows.set("t1", { ...t.mem.tasks.rows.get("t1")!, remindBeforeMin: 60, remindedAt: new Date() });
    await t.tasks.update(manager, "t1", { title: "Перезвонить вечером", kind: "call", dueAt: "2026-10-21T19:00", result: "  договорились  " });
    expect(t.mem.tasks.rows.get("t1")).toMatchObject({ title: "Перезвонить вечером", kind: "call", remindBeforeMin: 60, remindedAt: null, result: "договорились" });
    expect(t.mem.tasks.rows.get("t1")!.dueAt).toEqual(new Date("2026-10-21T19:00"));
    // Срок убрали — напоминать не о чем; срок появился у задачи без срока — напоминание по умолчанию.
    await t.tasks.update(manager, "t1", { dueAt: null });
    expect(t.mem.tasks.rows.get("t1")).toMatchObject({ dueAt: null, remindBeforeMin: null });
    await t.tasks.update(manager, "t1", { dueAt: "2026-10-22" });
    expect(t.mem.tasks.rows.get("t1")).toMatchObject({ remindBeforeMin: 60 });
  });

  it("смена ответственного: «все» передают кому угодно и новый получает уведомление; «только свои» — нет; бывшему — нельзя", async () => {
    const t = setup();
    t.mem.tasks.seed({ id: "t1", assigneeId: "m1", createdById: "m1" });
    await expect(t.tasks.update(manager, "t1", { assigneeId: "m2" })).rejects.toMatchObject({ code: "forbidden" });
    await t.tasks.update(head, "t1", { assigneeId: "m2" });
    expect(t.mem.tasks.rows.get("t1")?.assigneeId).toBe("m2");
    expect(t.notifier.sent.at(-1)).toMatchObject({ userIds: ["m2"], n: { kind: "task" } });
    expect(t.notifier.sent.at(-1)?.n.title).toContain("Вам передали задачу");
    await expect(t.tasks.update(head, "t1", { assigneeId: "x1" })).rejects.toMatchObject({ code: "staffNotFound" });
    // Чужую задачу (не моя, не я ставил) без права «все задачи» не правят.
    t.mem.tasks.seed({ id: "t2", assigneeId: "m2", createdById: "h1" });
    await expect(t.tasks.update(manager, "t2", { title: "моё" })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("своя задача: клиент — из явного id, заказа или сделки; уведомлений нет", async () => {
    const t = setup();
    expect(await t.tasks.create(manager, { title: "Перезвонить", kind: "call", orderId: "order-1" })).toEqual({ clientId: "client-1" });
    expect(t.mem.tasks.last()).toMatchObject({ title: "Перезвонить", kind: "call", clientId: "client-1", orderId: "order-1", dealId: null, assigneeId: "m1", createdById: "m1", doneAt: null, dueAt: null });
    expect(await t.tasks.create(manager, { title: "Встреча", kind: "meeting", dealId: "deal-1" })).toEqual({ clientId: "client-2" });
    // явный клиент важнее заказа; неизвестный заказ — дальше смотрим сделку; без привязок — null
    expect(await t.tasks.create(manager, { title: "a", kind: "task", clientId: "client-9", orderId: "order-1" })).toEqual({ clientId: "client-9" });
    expect(await t.tasks.create(manager, { title: "b", kind: "task", orderId: "order-x", dealId: "deal-1" })).toEqual({ clientId: "client-2" });
    expect(await t.tasks.create(manager, { title: "c", kind: "task", assigneeId: "m1" })).toEqual({ clientId: null });
    expect(t.notifier.sent).toEqual([]);
  });

  it("срок без времени — 18:00 по часовому поясу процесса, со временем — как есть", async () => {
    const t = setup();
    await t.tasks.create(manager, { title: "До вечера", kind: "task", dueAt: "2026-10-20" });
    expect(t.mem.tasks.last().dueAt).toEqual(new Date(2026, 9, 20, 18));
    await t.tasks.create(manager, { title: "Утром", kind: "task", dueAt: "2026-10-20T09:30" });
    expect(t.mem.tasks.last().dueAt).toEqual(new Date(2026, 9, 20, 9, 30));
  });

  it("задача коллеге: уведомление со ссылкой на сделку, заказ или список задач", async () => {
    const t = setup();
    await t.tasks.create(head, { title: "Позвонить", kind: "call", dealId: "deal-1", orderId: "order-1", assigneeId: "m1" });
    await t.tasks.create(lead, { title: "Счёт", kind: "task", orderId: "order-1", assigneeId: "m1" });
    await t.tasks.create(head, { title: "Написать", kind: "message", clientId: "client-1", assigneeId: "m2" });
    expect(t.notifier.sent).toEqual([
      { userIds: ["m1"], n: { kind: "task", title: "Новая задача: Позвонить", body: "Поставил(а) Марат", link: "/admin/deals/deal-1" } },
      { userIds: ["m1"], n: { kind: "task", title: "Новая задача: Счёт", body: "Поставил(а) Айгерим Сапарова", link: "/admin/orders/order-1" } },
      { userIds: ["m2"], n: { kind: "task", title: "Новая задача: Написать", body: "Поставил(а) Марат", link: "/admin/tasks" } },
    ]);
    expect(t.mem.tasks.last()).toMatchObject({ assigneeId: "m2", createdById: "h1" });
  });

  it("«только свои» не ставит задачи другим: forbidden, ничего не записано", async () => {
    const t = setup();
    await expect(t.tasks.create(manager, { title: "Тебе", kind: "task", assigneeId: "m2" })).rejects.toMatchObject({ code: "forbidden", context: "clients" });
    expect(t.mem.tasks.rows.size).toBe(0);
    expect(t.notifier.sent).toEqual([]);
  });

  it("исполнитель сверяется со справочником сотрудников, как ответственный клиента: отключённому — «Сотрудник не найден» (B12)", async () => {
    const t = setup();
    await expect(t.tasks.create(head, { title: "Старое", kind: "task", assigneeId: "x1" })).rejects.toMatchObject({ code: "staffNotFound" });
    expect(t.mem.tasks.rows.size).toBe(0);
    expect(t.notifier.sent).toEqual([]);
    expect(t.staff.checked).toEqual(["x1"]);
    // себе — без проверки по справочнику
    await t.tasks.create(head, { title: "Себе", kind: "task" });
    expect(t.staff.checked).toEqual(["x1"]);
  });

  it("отметка «сделано»: время из часов, повторно — снимается; возвращается задача до переключения", async () => {
    const t = setup();
    t.mem.tasks.seed({ id: "t1", assigneeId: "m1" });
    expect(await t.tasks.toggle(manager, "t1")).toMatchObject({ id: "t1", doneAt: null });
    expect(t.mem.tasks.rows.get("t1")?.doneAt).toEqual(new Date("2026-10-01T10:00:00Z"));
    t.c.set("2026-10-02T08:00:00Z");
    expect((await t.tasks.toggle(manager, "t1")).doneAt).toEqual(new Date("2026-10-01T10:00:00Z"));
    expect(t.mem.tasks.rows.get("t1")?.doneAt).toBeNull();
  });

  it("чужую задачу закрывают только с правом «все задачи»; свою, ничью и поставленную мной — можно", async () => {
    const t = setup();
    t.mem.tasks.seed({ id: "foreign", assigneeId: "h1", createdById: "h1" });
    t.mem.tasks.seed({ id: "mine", assigneeId: "h1", createdById: "m1" });
    t.mem.tasks.seed({ id: "nobody's" });
    for (const actor of [manager, lead]) await expect(t.tasks.toggle(actor, "foreign")).rejects.toMatchObject({ code: "forbidden" });
    expect(t.mem.tasks.rows.get("foreign")?.doneAt).toBeNull();
    await t.tasks.toggle(head, "foreign");
    await t.tasks.toggle(manager, "mine");
    await t.tasks.toggle(manager, "nobody's");
    expect([...t.mem.tasks.rows.values()].every((x) => x.doneAt)).toBe(true);
  });

  it("нет задачи: переключение — taskNotFound, удаление — null без ошибки", async () => {
    const t = setup();
    await expect(t.tasks.toggle(head, "missing")).rejects.toMatchObject({ code: "taskNotFound", message: "Задача не найдена" });
    expect(await t.tasks.delete(head, "missing")).toBeNull();
  });

  it("удаление: свою — можно и возвращает её, чужую без права — forbidden и задача остаётся", async () => {
    const t = setup();
    t.mem.tasks.seed({ id: "own", assigneeId: "m1", clientId: "client-1" });
    t.mem.tasks.seed({ id: "foreign", assigneeId: "h1" });
    expect(await t.tasks.delete(manager, "own")).toMatchObject({ id: "own", clientId: "client-1" });
    await expect(t.tasks.delete(manager, "foreign")).rejects.toMatchObject({ code: "forbidden" });
    expect([...t.mem.tasks.rows.keys()]).toEqual(["foreign"]);
  });
});

describe("NotesService: заметки и @упоминания", () => {
  it("звонок, сообщение или письмо в сделке — менеджер связался с клиентом: заявка принята в работу; простая заметка и записи вне сделки — нет", async () => {
    const t = setup();
    await t.notes.add(manager, { kind: "call", text: "Поговорили, думает", dealId: "deal-1" });
    await t.notes.add(manager, { kind: "message", text: "Написал в Telegram", dealId: "deal-1" });
    await t.notes.add(head, { kind: "email", text: "Отправили КП", dealId: "deal-2", clientId: "client-1" });
    await t.notes.add(manager, { kind: "note", text: "Похоже на спам", dealId: "deal-1" });
    await t.notes.add(manager, { kind: "call", text: "Договорились на пятницу", clientId: "client-1" });
    expect(t.accepted).toEqual(["deal-1:m1:записан звонок", "deal-1:m1:записано сообщение", "deal-2:h1:записано письмо"]);
    expect(t.mem.notes.rows.size).toBe(5);
  });

  it("заметка без «@» сохраняется, список сотрудников не запрашивается", async () => {
    const t = setup();
    await t.notes.add(manager, { kind: "call", text: "Договорились на пятницу", clientId: "client-1" });
    expect([...t.mem.notes.rows.values()]).toEqual([{ id: "note-1", kind: "call", text: "Договорились на пятницу", clientId: "client-1", orderId: null, dealId: null, authorId: "m1" }]);
    expect(t.staff.lookups).toBe(0);
    expect(t.notifier.sent).toEqual([]);
  });

  it("упомянутые получают уведомление; длинное имя не засчитывается как короткое; автор себя не уведомляет", async () => {
    const t = setup();
    const text = "@Айгерим Сапарова и @марат, проверьте адрес. Пишет @Айгерим";
    await t.notes.add(manager, { kind: "note", text, clientId: "client-1" });
    expect(t.notifier.sent).toEqual([{ userIds: ["m2", "h1"], n: { kind: "mention", title: "Айгерим упомянул(а) вас · заметка о клиенте", body: text, link: "/admin/clients/client-1" } }]);
  });

  it("сделка — «заметка в сделке» со ссылкой на сделку; заказ — «заметка к заказу» со ссылкой на заказ (B12)", async () => {
    const t = setup();
    await t.notes.add(head, { kind: "note", text: "@Айгерим глянь", clientId: "client-2", dealId: "deal-1", orderId: "order-1" });
    await t.notes.add(head, { kind: "note", text: "@Айгерим глянь", clientId: "client-1", orderId: "order-1" });
    expect(t.notifier.sent.map((s) => [s.n.title, s.n.link])).toEqual([
      ["Марат упомянул(а) вас · заметка в сделке", "/admin/deals/deal-1"],
      ["Марат упомянул(а) вас · заметка к заказу", "/admin/orders/order-1"],
    ]);
  });

  it("в уведомление идут первые 300 символов, в заметку — весь текст", async () => {
    const t = setup();
    const text = `@Марат ${"а".repeat(400)}`;
    await t.notes.add(manager, { kind: "note", text, clientId: "client-1" });
    expect(t.notifier.sent[0].n.body).toBe(text.slice(0, 300));
    expect(t.mem.notes.rows.get("note-1")?.text).toBe(text);
  });

  it("без уведомлений: «@» в e-mail, упоминание только себя, отключённый сотрудник", async () => {
    const t = setup();
    for (const text of ["Пишите на a@b.kz", "Напоминаю себе: @Айгерим", "Спросить у @Бывший"]) await t.notes.add(manager, { kind: "note", text, clientId: "client-1" });
    expect(t.staff.lookups).toBe(3);
    expect(t.notifier.sent).toEqual([]);
    expect(t.mem.notes.rows.size).toBe(3);
  });

  it("без привязки — уведомление без ссылки, а не /admin/clients/undefined (B12)", async () => {
    const t = setup();
    await t.notes.add(manager, { kind: "note", text: "@Марат" });
    expect(t.notifier.sent[0].n.link).toBeNull();
  });

  it("удаление: обычную — можно, системную — forbidden, нет заметки — null", async () => {
    const t = setup();
    await t.notes.add(manager, { kind: "email", text: "Отправили макет", clientId: "client-1" });
    t.mem.notes.rows.set("sys", { id: "sys", kind: "system", text: "Этап: Оплачен", clientId: "client-1", orderId: null, dealId: "deal-1", authorId: "h1" });
    expect(await t.notes.find("sys")).toEqual({ id: "sys", kind: "system", text: "Этап: Оплачен", clientId: "client-1", orderId: null, dealId: "deal-1" });
    expect(await t.notes.delete("note-1")).toMatchObject({ id: "note-1", kind: "email" });
    await expect(t.notes.delete("sys")).rejects.toMatchObject({ code: "forbidden", context: "clients" });
    expect(await t.notes.delete("missing")).toBeNull();
    expect(await t.notes.find("note-1")).toBeNull();
    expect([...t.mem.notes.rows.keys()]).toEqual(["sys"]);
  });
});

describe("TasksService: напоминание о сроке задачи", () => {
  it("по умолчанию за час; приходит один раз, раньше времени молчит, готовой задаче не шлётся", async () => {
    const t = setup();
    await t.tasks.create(manager, { title: "Перезвонить", kind: "call", dueAt: "2030-01-10T15:00" });
    expect(t.mem.tasks.last()).toMatchObject({ remindBeforeMin: 60 });
    expect(await t.tasks.remindDue()).toBe(0); // срок далеко
    const row = t.mem.tasks.last();
    t.mem.tasks.rows.set(row.id, { ...row, dueAt: new Date(t.c.now().getTime() + 50 * 60_000) });
    expect(await t.tasks.remindDue()).toBe(1);
    expect(t.notifier.sent.at(-1)).toMatchObject({ userIds: ["m1"], n: { kind: "reminder" } });
    expect(await t.tasks.remindDue()).toBe(0); // один раз
  });

  it("null — не напоминать; задача без срока напоминания не получает", async () => {
    const t = setup();
    await t.tasks.create(manager, { title: "Без напоминания", kind: "task", dueAt: "2030-01-10", remindBeforeMin: null });
    expect(t.mem.tasks.last().remindBeforeMin).toBeNull();
    await t.tasks.create(manager, { title: "Без срока", kind: "task" });
    expect(t.mem.tasks.last().remindBeforeMin).toBeNull();
  });
});

describe("TasksService: задачи от CRM (бот, правила, «Перезвоните мне») — tasks-d2", () => {
  const at = (iso: string) => new Date(iso);

  it("задача бота — с напоминанием за час до срока, автор — CRM; ответственному в CRM, а не молча", async () => {
    const t = setup(); // сейчас 01.10 10:00 UTC
    expect(await t.tasks.createSystem({ title: "Ответить: Айгерим — просит менеджера (бот)", kind: "message", dueAt: at("2026-10-02T04:15:00Z"), dealId: "deal-1", assigneeId: "m1" })).toBe(true);
    expect(t.mem.tasks.last()).toMatchObject({ kind: "message", assigneeId: "m1", createdById: null, clientId: "client-2", dealId: "deal-1", remindBeforeMin: 60 });
    // Уведомление о новой задаче шлёт тот, кто её ставит (бот, правило), — сервис не дублирует.
    expect(t.notifier.sent).toEqual([]);
    t.c.set("2026-10-02T03:10:00Z");
    expect(await t.tasks.remindDue()).toBe(0);
    t.c.set("2026-10-02T03:15:00Z"); // за час до срока
    expect(await t.tasks.remindDue()).toBe(1);
    expect(t.notifier.sent).toEqual([{ userIds: ["m1"], n: { kind: "reminder", title: "Через 1 ч срок задачи: Ответить: Айгерим — просит менеджера (бот)", body: "Срок: 02.10 09:15", link: "/admin/deals/deal-1" } }]);
  });

  it("до срока меньше часа («Перезвонить — заявка с сайта», +15 мин) — напоминание в сам срок, а не сразу вслед за уведомлением", async () => {
    const t = setup();
    await t.tasks.createSystem({ title: "Перезвонить Айгерим — заявка с сайта", kind: "call", dueAt: at("2026-10-01T10:15:00Z"), dealId: "deal-1", assigneeId: "m1" });
    expect(t.mem.tasks.last()).toMatchObject({ remindBeforeMin: 0 });
    t.c.set("2026-10-01T10:01:00Z");
    expect(await t.tasks.remindDue()).toBe(0);
    t.c.set("2026-10-01T10:15:00Z");
    expect(await t.tasks.remindDue()).toBe(1);
    expect(t.notifier.sent.at(-1)?.n.title).toBe("Срок задачи наступил: Перезвонить Айгерим — заявка с сайта");
  });

  it("ничья задача (ночь, круг ещё не раздал) — напоминание всем с deals.view, в WhatsApp — никому", async () => {
    const t = setup();
    const whatsapp: string[] = [];
    const tasks = new TasksService(t.mem.tasks, { clientOfOrder: async () => null, clientOfDeal: async () => null, dealAssignee: async () => null }, t.notifier, t.c, t.staff, { send: async (id) => (whatsapp.push(id), true) });
    await tasks.createSystem({ title: "Выставить счёт: Айгерим (бот)", kind: "task", dueAt: at("2026-10-01T10:05:00Z"), dealId: "deal-7", assigneeId: null });
    expect(t.mem.tasks.last()).toMatchObject({ assigneeId: null, createdById: null, remindBeforeMin: 0 });
    t.c.set("2026-10-01T10:05:00Z");
    expect(await tasks.remindDue()).toBe(1);
    expect(t.notifier.sent).toEqual([{ userIds: ["deals.view"], n: { kind: "reminder", title: "Срок задачи наступил: Выставить счёт: Айгерим (бот)", body: "Срок: 01.10 15:05 · задача ничья — возьмите её", link: "/admin/deals/deal-7" } }]);
    expect(whatsapp).toEqual([]);
    expect(await tasks.remindDue()).toBe(0); // один раз
  });

  it("ответственный отключён — задача ничья; once — одна открытая с этим заголовком на сделку", async () => {
    const t = setup();
    await t.tasks.createSystem({ title: "Позвонить", kind: "call", dueAt: at("2026-10-01T12:00:00Z"), dealId: "deal-1", assigneeId: "x1" });
    expect(t.mem.tasks.last()).toMatchObject({ assigneeId: null });
    expect(await t.tasks.createSystem({ title: "Позвонить", kind: "call", dueAt: at("2026-10-01T12:00:00Z"), dealId: "deal-1", assigneeId: "m1", once: true })).toBe(false);
    expect(t.mem.tasks.rows.size).toBe(1);
    // Без срока — без напоминания.
    await t.tasks.createSystem({ title: "Проверить переплату", kind: "task", dueAt: null, orderId: "order-1", assigneeId: "m1" });
    expect(t.mem.tasks.last()).toMatchObject({ remindBeforeMin: null, clientId: "client-1", orderId: "order-1" });
  });

  it("за проход — не больше 200 напоминаний, ранние сроки первыми; остальные — в следующем", async () => {
    const t = setup();
    for (let i = 0; i < 205; i++) t.mem.tasks.seed({ id: `t${i}`, assigneeId: "m1", dueAt: new Date(t.c.now().getTime() + (30 - (i % 30)) * 60_000) });
    for (const [id, row] of t.mem.tasks.rows) t.mem.tasks.rows.set(id, { ...row, remindBeforeMin: 60 });
    expect(await t.tasks.remindDue()).toBe(200);
    expect(await t.tasks.remindDue()).toBe(5);
  });
});

describe("TasksService: задачи идут за сделкой — tasks-d3", () => {
  const at = (iso: string) => new Date(iso);

  it("сделку передали по кругу — открытые задачи прежнего и ничьи у нового, напоминание взведено заново; чужие и готовые не трогаются", async () => {
    const t = setup(); // сейчас 01.10 10:00 UTC
    const due = at("2026-10-01T10:30:00Z");
    t.mem.tasks.seed({ id: "own", dealId: "deal-1", assigneeId: "m1", dueAt: due });
    t.mem.tasks.seed({ id: "night", dealId: "deal-1", assigneeId: null, dueAt: due, title: "Ответить: Айгерим (бот)" });
    t.mem.tasks.seed({ id: "colleague", dealId: "deal-1", assigneeId: "h1", dueAt: due });
    t.mem.tasks.seed({ id: "done", dealId: "deal-1", assigneeId: "m1", doneAt: at("2026-10-01T09:00:00Z") });
    t.mem.tasks.seed({ id: "other", dealId: "deal-2", assigneeId: "m1", dueAt: due });
    for (const [id, row] of t.mem.tasks.rows) t.mem.tasks.rows.set(id, { ...row, remindBeforeMin: 60 });
    // Прежнему ответственному напоминания уже ушли.
    expect(await t.tasks.remindDue()).toBe(4);
    t.notifier.sent.length = 0;

    expect(await t.tasks.followDeal({ dealId: "deal-1", from: "m1", to: "m2" })).toBe(2);
    const row = (id: string) => t.mem.tasks.rows.get(id)!;
    expect([row("own").assigneeId, row("night").assigneeId, row("colleague").assigneeId, row("done").assigneeId, row("other").assigneeId]).toEqual(["m2", "m2", "h1", "m1", "m1"]);
    // Новый ответственный получает напоминание сам — прежнему повторно не шлётся.
    expect(await t.tasks.remindDue()).toBe(2);
    expect(t.notifier.sent.map((s) => s.userIds)).toEqual([["m2"], ["m2"]]);
  });

  it("сделки не было ни у кого — новому переходят только ничьи; тот же или отключённый сотрудник — ничего не меняется", async () => {
    const t = setup();
    t.mem.tasks.seed({ id: "night", dealId: "deal-1", assigneeId: null });
    t.mem.tasks.seed({ id: "colleague", dealId: "deal-1", assigneeId: "h1" });
    expect(await t.tasks.followDeal({ dealId: "deal-1", from: "m1", to: "m1" })).toBe(0);
    expect(await t.tasks.followDeal({ dealId: "deal-1", from: null, to: "x1" })).toBe(0);
    expect(t.mem.tasks.rows.get("night")?.assigneeId).toBeNull();
    expect(await t.tasks.followDeal({ dealId: "deal-1", from: null, to: "m2" })).toBe(1);
    expect([t.mem.tasks.rows.get("night")?.assigneeId, t.mem.tasks.rows.get("colleague")?.assigneeId]).toEqual(["m2", "h1"]);
  });

  it("передали задачу вручную — напоминание взводится заново и придёт новому ответственному", async () => {
    const t = setup();
    t.mem.tasks.seed({ id: "t1", dealId: "deal-1", assigneeId: "m1", dueAt: at("2026-10-01T10:30:00Z") });
    t.mem.tasks.rows.set("t1", { ...t.mem.tasks.rows.get("t1")!, remindBeforeMin: 60, remindedAt: at("2026-10-01T09:30:00Z") });
    await t.tasks.update(head, "t1", { assigneeId: "m2" });
    expect(t.mem.tasks.rows.get("t1")?.remindedAt).toBeNull();
    expect(await t.tasks.remindDue()).toBe(1);
    expect(t.notifier.sent.at(-1)).toMatchObject({ userIds: ["m2"], n: { kind: "reminder" } });
  });
});

describe("TasksService: напоминание сотруднику в WhatsApp — только в рабочее время (tasks-d5)", () => {
  it("ночью — только в CRM, днём — в CRM и WhatsApp; ничья задача в WhatsApp не уходит никогда", async () => {
    const t = setup();
    const whatsapp: string[] = [];
    let working = false;
    const tasks = new TasksService(t.mem.tasks, { clientOfOrder: async () => null, clientOfDeal: async () => null, dealAssignee: async () => null }, t.notifier, t.c, t.staff, { send: async (id) => (whatsapp.push(id), true) }, { isWorkTime: async () => working });
    const soon = () => new Date(t.c.now().getTime() + 30 * 60_000);
    t.mem.tasks.seed({ id: "night", assigneeId: "m1", dueAt: soon() });
    t.mem.tasks.rows.set("night", { ...t.mem.tasks.rows.get("night")!, remindBeforeMin: 60 });
    expect(await tasks.remindDue()).toBe(1);
    expect(t.notifier.sent.map((s) => s.userIds)).toEqual([["m1"]]);
    expect(whatsapp).toEqual([]);
    working = true;
    t.mem.tasks.seed({ id: "day", assigneeId: "m2", dueAt: soon() });
    t.mem.tasks.seed({ id: "nobody", assigneeId: null, dueAt: soon() });
    for (const id of ["day", "nobody"]) t.mem.tasks.rows.set(id, { ...t.mem.tasks.rows.get(id)!, remindBeforeMin: 60 });
    expect(await tasks.remindDue()).toBe(2);
    expect(whatsapp).toEqual(["m2"]);
  });
});
