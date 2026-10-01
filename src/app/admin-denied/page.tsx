import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { getCurrentUser } from "@/server/auth";
import { trustedClientIp } from "@/lib/rate-limit";
import { logoutAction } from "@/app/(auth)/actions";

export const metadata = { title: "Нет доступа к CRM", robots: { index: false } };

/** Сотрудник зашёл не из разрешённой сети (раздел «Безопасность» → список IP). */
export default async function AdminDenied() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/");
  const ip = await trustedClientIp();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <ShieldAlert className="size-12 text-wine" strokeWidth={1.4} />
      <h1 className="text-2xl font-semibold">Вход в CRM ограничен</h1>
      <p className="text-muted">
        Руководитель разрешил вход в CRM только из определённых сетей (например, из офиса). Ваш адрес: <b className="font-mono text-ink">{ip}</b>. Подключитесь к рабочей сети или попросите руководителя добавить этот адрес.
      </p>
      <form action={logoutAction}>
        <button className="btn btn-outline btn-sm">Выйти</button>
      </form>
    </main>
  );
}
