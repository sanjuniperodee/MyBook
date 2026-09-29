import { desc, ilike, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { books, orders, users } from "@/lib/db/schema";
import { formatDate } from "@/lib/utils";
import { RoleButton } from "./RoleButton";

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const s = q?.trim() ? `%${q.trim()}%` : null;
  const list = await db
    .select({
      user: users,
      books: sql<number>`(select count(*)::int from ${books} b where b.user_id = ${users.id})`,
      orders: sql<number>`(select count(*)::int from ${orders} o where o.user_id = ${users.id})`,
    })
    .from(users)
    .where(s ? or(ilike(users.email, s), ilike(users.name, s), ilike(users.phone, s)) : undefined)
    .orderBy(desc(users.createdAt))
    .limit(200);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Клиенты</h1>
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Имя, e-mail, телефон" className="input h-10 w-64" />
          <button className="btn btn-dark btn-sm h-10">Найти</button>
        </form>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[700px] text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Клиент</th>
              <th className="px-4 py-3 font-medium">Регистрация</th>
              <th className="px-4 py-3 font-medium">Книг</th>
              <th className="px-4 py-3 font-medium">Заказов</th>
              <th className="px-4 py-3 font-medium">Роль</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.map(({ user, books, orders }) => (
              <tr key={user.id}>
                <td className="px-4 py-3">
                  <div>{user.name || "—"}</div>
                  <div className="text-xs text-muted">{user.email}{user.phone ? ` · ${user.phone}` : ""}</div>
                </td>
                <td className="px-4 py-3 text-muted">{formatDate(user.createdAt)}</td>
                <td className="px-4 py-3">{books}</td>
                <td className="px-4 py-3">{orders}</td>
                <td className="px-4 py-3"><RoleButton userId={user.id} role={user.role} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
