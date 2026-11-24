import { notFound } from "next/navigation";
import { BoardsError } from "@/modules/boards";
import { staffOptions } from "@/modules/access/ui";
import { requireStaff } from "@/server/access";
import { boardViewer } from "@/server/boards-api";
import { container } from "@/server/container";
import { pageId } from "@/server/input";
import { BoardApp } from "../BoardApp";

export const metadata = { title: "Доска" };

type Sp = Record<string, string | undefined>;

/** Доска задач: колонки, карточки, виды (список, календарь, шкала), фильтры, автоматизация — BoardApp. */
export default async function BoardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Sp> }) {
  const staff = await requireStaff();
  const v = boardViewer(staff);
  const id = pageId((await params).id);
  const sp = await searchParams;
  const c = container();
  let view;
  try {
    view = await c.boards.boards.view(v, id, { done: sp.done === "1" });
  } catch (e) {
    if (BoardsError.is(e)) notFound();
    throw e;
  }
  const [boards, admins] = await Promise.all([c.boards.boards.list(v), c.access.queries.allStaff()]);
  const query = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => !!e[1] && e[0] !== "card")).toString();
  const card = sp.card && /^[0-9a-f-]{36}$/i.test(sp.card) ? sp.card : null;
  return <BoardApp initial={view} boards={boards} staff={staffOptions(admins)} me={staff.user.id} initialQuery={query} initialCard={card} />;
}
