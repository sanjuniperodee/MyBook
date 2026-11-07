import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { getCurrentUser } from "@/server/auth";
import { trustedClientIp } from "@/server/rateLimit";
import { logoutAction } from "@/app/(auth)/actions";

export const metadata = { title: "Нет доступа к CRM", robots: { index: false } };

/** Сотрудник зашёл не из разрешённой сети (раздел «Безопасность» → список IP). */
export default async function AdminDenied() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/");
  const ip = await trustedClientIp();
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <div className="panel w-full max-w-md p-6 text-center sm:p-8">
        <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-rose text-wine">
          <ShieldAlert className="size-6" strokeWidth={1.8} aria-hidden />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Вход в CRM ограничен</h1>
        <p className="mt-2 text-sm text-muted">Руководитель разрешил вход в CRM только из определённых сетей, например из офиса. Подключитесь к рабочей сети или попросите руководителя добавить этот адрес.</p>
        <div className="mt-5 rounded-[10px] bg-sunken px-4 py-3">
          <div className="text-xs text-muted">Ваш адрес</div>
          <div className="mt-0.5 font-mono text-[15px] font-medium text-ink select-all">{ip}</div>
        </div>
        <form action={logoutAction} className="mt-6">
          <button className="btn btn-outline w-full sm:w-auto">Выйти</button>
        </form>
      </div>
    </main>
  );
}
