import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { getCurrentUser } from "@/server/auth";
import { trustedClientIp } from "@/server/rateLimit";
import { logoutAction } from "@/app/(auth)/actions";
import { THEME_SCRIPT, ThemeSync } from "@/components/admin/Theme";

export const metadata = { title: "Нет доступа к CRM", robots: { index: false } };

/** Сотрудник зашёл не из разрешённой сети (раздел «Безопасность» → список IP). */
export default async function AdminDenied() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/");
  const ip = await trustedClientIp();
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      <ThemeSync />
      <div className="w-full max-w-lg">
        <span className="flex size-11 items-center justify-center rounded-[var(--r-panel)] bg-rose text-wine">
          <ShieldAlert className="size-5" strokeWidth={1.8} aria-hidden />
        </span>
        <h1 className="mt-4 text-[22px] font-semibold tracking-[-0.015em]">Вход в CRM ограничен</h1>
        <p className="mt-1.5 text-sm text-muted">Руководитель разрешил вход в CRM только из определённых сетей, например из офиса. С этого адреса войти нельзя.</p>

        <div className="panel mt-6">
          <div className="border-b border-line px-4 py-3 sm:px-5">
            <div className="text-xs text-muted">Ваш адрес</div>
            <div className="mt-0.5 font-mono text-[15px] font-medium select-all" data-testid="denied-ip">
              {ip}
            </div>
          </div>
          <div className="px-4 py-4 sm:px-5">
            <h2 className="text-sm font-semibold">Что делать</h2>
            <ol className="mt-3 space-y-3 text-sm">
              {[
                "Подключитесь к рабочей сети (офис или VPN) и проверьте вход снова.",
                "Или отправьте руководителю адрес выше: он добавит его в «Безопасность», в список разрешённых сетей.",
                "Если вы вошли не под своим аккаунтом, выйдите и войдите заново.",
              ].map((t, i) => (
                <li key={i} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3">
                  <span className="grid size-6 place-items-center rounded-full bg-sunken text-xs font-semibold text-ink-soft tabular-nums" aria-hidden>
                    {i + 1}
                  </span>
                  <span className="pt-0.5 text-ink-soft">{t}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/admin" className="btn btn-dark max-sm:flex-1">
            Проверить вход снова
          </Link>
          <form action={logoutAction} className="max-sm:flex-1">
            <button className="btn btn-outline w-full">Выйти</button>
          </form>
        </div>
      </div>
    </main>
  );
}
