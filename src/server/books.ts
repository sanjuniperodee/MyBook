import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { pageId } from "./input";
import type { BookRow, BookViewer } from "@/modules/authoring";
import { isStaff, type User } from "./auth";
import { container } from "./container";
import { can, canSeeBook, getStaff } from "./access";

/**
 * Кто смотрит книгу: владелец или сотрудник CRM. Книги клиентов открыты сотруднику с правом clients.view (менять —
 * ещё и clients.edit), вошедшему из разрешённой сети и с 2FA, если она обязательна (getStaff) — решение 1 (V1).
 * Роль «только свои» — только книги своих клиентов: доступ сотрудника решается по книге bookId; без неё — как у клиента
 * (только свои книги). user — текущий пользователь запроса.
 */
export async function viewerOf(user: Pick<User, "id" | "role" | "staffDisabled">, bookId?: string | null): Promise<BookViewer> {
  const staff = isStaff(user) ? await getStaff() : null;
  const own = staff?.user.id === user.id ? staff : null;
  const sees = can(own, "clients.view") && (own!.scope === "all" || (!!bookId && (await canSeeBook(own!, bookId))));
  const acting = sees ? own : null;
  return { userId: user.id, isStaff: can(acting, "clients.view"), staffEdits: can(acting, "clients.view", "clients.edit") };
}

/** Книга текущего пользователя (или любая — для сотрудника); чужая — 404. Кэш на запрос. */
export const getAccessibleBook = cache(async (bookId: string, user: User): Promise<BookRow> => {
  pageId(bookId);
  const book = await container().authoring.queries.visibleBook(bookId, await viewerOf(user, bookId));
  if (!book) notFound();
  return book;
});
