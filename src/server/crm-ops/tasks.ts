import "server-only";
import { z } from "zod";
import { container } from "@/server/container";
import { uuid } from "@/server/input";
import { boardViewer } from "@/server/boards-api";
import { op } from "./op";

/** Сборщики задач CRM (ADR 0012, A5 — Раздел 5): список задач и карточка задачи (с карточкой доски). */
export const reads = {
  "tasks.list": op([], z.object({ who: z.string().max(40), done: z.boolean(), kind: z.string().max(20), q: z.string().max(100) }), async ({ who, done, kind, q }, staff) => {
    const seesAll = staff.scope === "all";
    // Чужие задачи — только роли «все записи» (как у страницы).
    const [rows, admins] = await Promise.all([container().reporting.taskList({ userId: staff.user.id, seesAll }, { who: seesAll ? who : "mine", done, kind, q }), container().access.queries.allStaff()]);
    return { rows, admins };
  }),

  "tasks.card": op([], z.object({ id: uuid }), async ({ id }, staff) => {
    const { loadTaskDetail } = await import("@/server/task-detail");
    const [d, card, admins] = await Promise.all([loadTaskDetail(staff, id), container().boards.cards.summary(boardViewer(staff), id).catch(() => null), container().access.queries.allStaff()]);
    return { d, card, admins };
  }),
};
