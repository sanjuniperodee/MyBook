import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TaskRow } from "@/app/admin/tasks/TaskRows";
import { taskContact, type ReachableTask, type Reacher } from "@/app/admin/tasks/task-row";
import { StaffContext } from "@/modules/access/domain";
import type { Permission } from "@/shared/domain/permissions";

// Блок «Сегодня» в «Моём дне» (tasks-17): строки задач с галочкой, «+1 ч» и «Завтра», «Позвонить» и «Написать».
// Серверные действия и роутер подменены: здесь проверяется, что видит менеджер, а не сервер.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
vi.mock("@/app/admin/actions", () => ({ deleteTaskAction: vi.fn(), snoozeTaskAction: vi.fn(), toggleTaskAction: vi.fn(), updateTaskAction: vi.fn(), createTaskAction: vi.fn() }));
vi.mock("@/app/admin/crm-actions", () => ({ callAction: vi.fn(), openChatAction: vi.fn() }));

const { TaskRows } = await import("@/app/admin/tasks/TaskRows");

const row = (p: Partial<TaskRow> = {}): TaskRow => ({
  id: "t1",
  title: "Перезвонить Айгерим",
  kind: "call",
  due: "2026-10-19T10:00",
  dueLabel: "до 19 окт. 10:00",
  overdue: true,
  done: false,
  doneLabel: null,
  assigneeId: "m1",
  remindBeforeMin: 60,
  result: "",
  context: { label: "сделка №12 · Айгерим", href: "/admin/deals/d1" },
  fromBot: false,
  editable: true,
  contact: { phone: "77011234567", target: { dealId: "d1" }, pbx: false, chat: false },
  ...p,
});
type Reach = { pbx: boolean; chat: boolean };
/** reach — звонок через АТС и «Открыть чат» у каждой строки с контактом (как их выставит taskContact). */
const html = (tasks: TaskRow[], reach: Reach = { pbx: false, chat: false }, compact = true) =>
  renderToStaticMarkup(<TaskRows tasks={tasks.map((t) => (t.contact ? { ...t, contact: { ...t.contact, ...reach } } : t))} staff={[]} canAssign={false} compact={compact} />);
/** Кнопки «связаться» под строкой (в списке типов задачи тоже есть «Позвонить» и «Написать»). */
const reachOf = (out: string) => out.split('data-testid="task-reach"')[1] ?? "";

describe("«Мой день»: задачи на сегодня", () => {
  it("строка с галочкой, «+1 ч» и «Завтра», срок подписью (просрочена — красным), без поля срока и ответственного", () => {
    const out = html([row()]);
    expect(out).toContain('aria-label="Выполнено"');
    expect(out).toContain("+1 ч");
    expect(out).toContain("Завтра");
    expect(out).toContain("просрочена · до 19 окт. 10:00");
    expect(out).not.toContain('type="datetime-local"');
    expect(out).not.toContain('aria-label="Ответственный"');
    expect(out).toContain('href="/admin/deals/d1"');
  });

  it("звонок: без АТС — ссылка tel:, с подключённой Zadarma — звонок через АТС; номер скрыт и АТС нет — кнопки нет", () => {
    expect(html([row()])).toContain('href="tel:+77011234567"');
    const pbx = reachOf(html([row()], { pbx: true, chat: false }));
    expect(pbx).not.toContain("tel:");
    expect(pbx).toContain("<button");
    expect(pbx).toContain("Позвонить");
    expect(html([row({ contact: { phone: null, target: { dealId: "d1" }, pbx: false, chat: false } })])).not.toContain('data-testid="task-reach"');
  });

  it("«Написать»: WhatsApp по wa.me и «Открыть чат» (право chats.send); у прочих задач и выполненных — ничего", () => {
    const out = reachOf(html([row({ kind: "message" })], { pbx: true, chat: true }));
    expect(out).toContain('href="https://wa.me/77011234567"');
    expect(out).toContain("Открыть чат");
    expect(out).not.toContain("Позвонить");
    expect(html([row({ kind: "message" })])).not.toContain("Открыть чат");
    expect(html([row({ kind: "task" })], { pbx: true, chat: true })).not.toContain('data-testid="task-reach"');
    const done = html([row({ done: true })], { pbx: true, chat: true });
    expect(done).not.toContain('data-testid="task-reach"');
    expect(done).not.toContain("+1 ч");
  });

  it("чужая задача без права менять — без «+1 ч» и «Завтра»; на странице «Задачи» — поле срока и ответственный на месте", () => {
    expect(html([row({ editable: false })])).not.toContain("+1 ч");
    const full = html([row({ contact: undefined })], undefined, false);
    expect(full).toContain('type="datetime-local"');
    expect(full).toContain("+1 ч");
    expect(full).not.toContain('data-testid="task-reach"');
  });
});

describe("«Мой день»: звонок через АТС и «Открыть чат» — только тому, кто ведёт сделку (taskContact)", () => {
  // Менеджер «только свои» и руководитель «все записи»: у обоих Zadarma, внутренний номер и право писать.
  const staff = (scope: "own" | "all", perms: Permission[] = ["calls.make", "chats.send", "clients.contacts"]) => {
    const ctx = new StaffContext("m1", "Менеджер", "manager", scope, new Set(perms), false, { isPhoneEmail: () => false });
    return { phoneVisible: ctx.can("clients.contacts"), works: (a: string | null) => ctx.canWork(a), pbx: true, chat: ctx.can("chats.send") } satisfies Reacher;
  };
  const task = (p: Partial<ReachableTask["task"]> = {}, who: Partial<Omit<ReachableTask, "task">> = {}): ReachableTask => ({
    task: { dealId: "d1", orderId: null, clientId: null, ...p },
    phone: "8 701 123 45 67",
    dealAssigneeId: null,
    orderAssigneeId: null,
    clientManagerId: null,
    ...who,
  });

  it("«ничья» задача бота на неразобранной сделке у «только свои» — без АТС и «Открыть чат»: tel: и wa.me, если номер виден", () => {
    const contact = taskContact(task(), staff("own"));
    expect(contact).toEqual({ phone: "77011234567", target: { dealId: "d1" }, pbx: false, chat: false });
    const call = reachOf(renderToStaticMarkup(<TaskRows tasks={[row({ assigneeId: null, fromBot: true, contact })]} staff={[]} canAssign={false} compact />));
    expect(call).toContain('href="tel:+77011234567"');
    expect(call).not.toContain("<button");
    const write = reachOf(renderToStaticMarkup(<TaskRows tasks={[row({ kind: "message", assigneeId: null, contact })]} staff={[]} canAssign={false} compact />));
    expect(write).toContain('href="https://wa.me/77011234567"');
    expect(write).not.toContain("Открыть чат");
  });

  it("своя сделка — АТС и «Открыть чат»; чужая — нет; руководителю «все записи» — и на неразобранной", () => {
    expect(taskContact(task({}, { dealAssigneeId: "m1" }), staff("own"))).toMatchObject({ pbx: true, chat: true });
    expect(taskContact(task({}, { dealAssigneeId: "m2" }), staff("own"))).toMatchObject({ pbx: false, chat: false });
    expect(taskContact(task(), staff("all"))).toMatchObject({ pbx: true, chat: true });
  });

  it("ответственный — того, к чему задача, в порядке сервера: сделка, иначе заказ, иначе клиент", () => {
    const own = staff("own");
    // Задача и к сделке, и к заказу: сервер звонит по сделке — решает её ответственный, а не заказа.
    expect(taskContact(task({ orderId: "o1" }, { dealAssigneeId: "m2", orderAssigneeId: "m1" }), own)).toMatchObject({ target: { dealId: "d1" }, pbx: false });
    expect(taskContact(task({ dealId: null, orderId: "o1" }, { orderAssigneeId: "m1", clientManagerId: "m2" }), own)).toMatchObject({ target: { orderId: "o1" }, pbx: true });
    expect(taskContact(task({ dealId: null, clientId: "c1" }, { clientManagerId: "m1" }), own)).toMatchObject({ target: { clientId: "c1" }, chat: true });
    expect(taskContact(task({ dealId: null, clientId: "c1" }), own)).toMatchObject({ pbx: false, chat: false });
    expect(taskContact(task({ dealId: null }), own)).toBeNull();
  });

  it("номер скрыт — ни tel:, ни wa.me; без права писать — без «Открыть чат» и на своей сделке", () => {
    const hidden = taskContact(task(), staff("own", ["calls.make", "chats.send"]));
    expect(hidden).toMatchObject({ phone: null, pbx: false });
    expect(renderToStaticMarkup(<TaskRows tasks={[row({ contact: hidden })]} staff={[]} canAssign={false} compact />)).not.toContain('data-testid="task-reach"');
    expect(taskContact(task({}, { dealAssigneeId: "m1" }), staff("own", ["calls.make", "clients.contacts"]))).toMatchObject({ pbx: true, chat: false });
  });
});
