import { NextResponse } from "next/server";
import { z } from "zod";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";
import { deleteTaskAction, updateTaskAction } from "@/app/admin/actions";
import { loadTaskDetail } from "@/app/admin/tasks/task-detail";
import { HttpError } from "@/server/api";
import { taskJson } from "@/app/api/mobile/work";

export const dynamic = "force-dynamic";

const patch = z.object({
  title: z.string().min(2).max(300).optional(),
  kind: z.enum(["task", "call", "message", "meeting"]).optional(),
  dueAt: z.string().nullable().optional(),
  remindBeforeMin: z.string().nullable().optional(),
  assigneeId: z.string().uuid().optional(),
  result: z.string().max(1000).optional(),
});

/** Карточка задачи: сама задача и всё, к чему она привязана — сделка, клиент, заказ, диалог, последние записи, другие задачи сделки. */
export const GET = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const staff = await apiStaff(req);
  const { id } = idParams(await params, "id");
  const d = await loadTaskDetail(staff, id);
  if (!d) throw new HttpError(404, "notFound");
  const iso = (x: Date | null) => x?.toISOString() ?? null;
  return NextResponse.json({
    // Та же запись, что в списке задач: по ней приложение отмечает, откладывает и правит задачу.
    item: { ...taskJson(d.raw as Parameters<typeof taskJson>[0], staff, new Date()), contact: d.row.contact },
    task: { ...d.task, dueAt: iso(d.task.dueAt), doneAt: iso(d.task.doneAt), done: !!d.task.doneAt, remindBeforeMin: d.row.remindBeforeMin },
    deal: d.deal,
    client: d.client,
    contact: d.contact,
    order: d.order,
    chat: d.chat,
    notes: d.notes.map((n) => ({ ...n, at: n.at.toISOString() })),
    others: d.others.map((o) => ({ ...o, dueAt: iso(o.dueAt) })),
    // Звонок и чат по задаче: цель (сделка, заказ, клиент) и что разрешено этому сотруднику — как у строки задачи.
    reach: d.row.contact ?? null,
  });
});

/** Изменить задачу: заголовок, тип, срок (пустая строка — без срока), напоминание, ответственный, результат. */
export const PATCH = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await apiStaff(req);
  const { id } = idParams(await params, "id");
  const r = await updateTaskAction(id, patch.parse(await req.json()));
  return NextResponse.json(r, { status: r.error ? 400 : 200 });
});

export const DELETE = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await apiStaff(req);
  const { id } = idParams(await params, "id");
  await deleteTaskAction(id);
  return NextResponse.json({ ok: true });
});
