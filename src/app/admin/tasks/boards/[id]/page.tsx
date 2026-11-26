import { notFound } from "next/navigation";
import { staffOptions } from "@/modules/access/ui";
import { requireStaff } from "@/server/access";
import { pageId } from "@/server/input";
import { BoardApp } from "../BoardApp";
import { crmRead } from "@/server/v1-local-bridge-crm";

export const metadata = { title: "Доска" };

type Sp = Record<string, string | undefined>;

/** Доска задач: колонки, карточки, виды (список, календарь, шкала), фильтры, автоматизация — BoardApp. */
export default async function BoardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Sp> }) {
  const staff = await requireStaff();
  const id = pageId((await params).id);
  const sp = await searchParams;
  const data = await crmRead("pages.board", { id, done: sp.done === "1" });
  if (!data) notFound();
  const { view, boards, admins } = data;
  const query = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => !!e[1] && e[0] !== "card")).toString();
  const card = sp.card && /^[0-9a-f-]{36}$/i.test(sp.card) ? sp.card : null;
  return <BoardApp initial={view} boards={boards} staff={staffOptions(admins)} me={staff.user.id} initialQuery={query} initialCard={card} />;
}
