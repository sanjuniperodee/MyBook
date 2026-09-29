import { asc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { formatDate } from "@/lib/utils";
import { AccountForm, MemberActions } from "./TeamControls";

export const metadata = { title: "Доступы" };

export default async function AdminTeam() {
  const me = await requireAdmin();
  const admins = await db.select().from(users).where(eq(users.role, "admin")).orderBy(asc(users.createdAt));
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Доступы</h1>
      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="mb-4 font-semibold">Создать аккаунт или выдать доступ</h2>
        <AccountForm />
        <p className="mt-3 text-xs text-muted">
          Если такой e-mail уже зарегистрирован, у него просто изменится роль (и пароль, если вы его указали). Пустой пароль — сгенерируем и покажем один раз, передайте его человеку сами.
          Администратор видит все заказы, данные клиентов и CRM.
        </p>
      </section>
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Администратор</th>
              <th className="px-4 py-3 font-medium">Последний вход</th>
              <th className="px-4 py-3 font-medium">Создан</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {admins.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-3">
                  <div className="font-medium">{a.name || "—"}</div>
                  <div className="text-xs text-muted">{a.email}</div>
                </td>
                <td className="px-4 py-3 text-muted">{a.lastSeenAt ? formatDate(a.lastSeenAt) : "—"}</td>
                <td className="px-4 py-3 text-muted">{formatDate(a.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <MemberActions userId={a.id} isSelf={a.id === me.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
