import "server-only";
import { and, eq, gte, isNotNull, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { crmCalls, crmConversations, crmTasks } from "@/shared/infrastructure/db/schema";
import { crmDealsId } from "@/shared/infrastructure/db/refs";
import { localDay } from "./time";

/**
 * Общие условия выборок CRM: плитка «Моего дня», бейдж меню и экран по ссылке считают по одному условию, поэтому
 * числа не расходятся (tasks-d1). Число — отдельным count(*), а не длиной выборки с LIMIT.
 */

/** Кто смотрит отчёт: его id и видит ли он чужие записи. */
export interface Viewer {
  userId: string;
  seesAll: boolean;
}

/** Видимость для роли «только свои»: запись без ответственного или моя. */
export function visibleTo(viewer: Viewer, column: AnyPgColumn): SQL | undefined {
  if (viewer.seesAll) return undefined;
  return or(eq(column, viewer.userId), isNull(column));
}

/** Задачи на сегодня: мои и ничьи открытые со сроком до конца дня магазина (просроченные — тоже). Как бейдж «Задачи». */
export const todayTasks = (userId: string) => and(isNull(crmTasks.doneAt), lt(crmTasks.dueAt, localDay(1)), or(eq(crmTasks.assigneeId, userId), isNull(crmTasks.assigneeId)));

/** Клиент ждёт ответа: открытый диалог с ожиданием — как фильтр «Ждут ответа» в «Чатах». */
export const waitingChats = (viewer: Viewer) => and(isNotNull(crmConversations.awaitingSince), eq(crmConversations.status, "open"), visibleTo(viewer, crmConversations.assigneeId));

/** Пропущенные входящие за 3 дня, по которым не перезвонили, — как бейдж «Звонки» и фильтр «Пропущенные». */
export const missedCalls = (viewer: Viewer) =>
  and(eq(crmCalls.status, "missed"), eq(crmCalls.direction, "in"), isNull(crmCalls.handledAt), gte(crmCalls.startedAt, sql`now() - interval '3 days'`), visibleTo(viewer, crmCalls.staffId));

/**
 * У сделки нет открытой задачи — нет следующего шага: фильтр сделок «Без задачи» (task=none) и плитка «Моего дня».
 * В выборке из crm_deals; по частичному индексу crm_tasks_open_deal_idx.
 */
export const noOpenTask = () => sql`not exists (select 1 from crm_tasks t where t.deal_id = ${crmDealsId} and t.done_at is null)`;
