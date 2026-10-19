import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TaskReach, TaskRow } from "@/app/admin/tasks/TaskRows";

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
  contact: { phone: "77011234567", target: { dealId: "d1" } },
  ...p,
});
const html = (tasks: TaskRow[], reach: TaskReach = { pbx: false, chat: false }, compact = true) => renderToStaticMarkup(<TaskRows tasks={tasks} staff={[]} canAssign={false} compact={compact} reach={reach} />);
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
    expect(html([row({ contact: { phone: null, target: { dealId: "d1" } } })])).not.toContain('data-testid="task-reach"');
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
