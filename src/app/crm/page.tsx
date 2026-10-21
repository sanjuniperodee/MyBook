import { InstallCrm } from "@/components/admin/InstallCrm";
import { LogoMark } from "@/components/Logo";

export const metadata = {
  title: "MyBooks CRM — установка на телефон",
  robots: { index: false },
  // Установка именно отсюда открывает CRM, а не лендинг: у этой страницы свой манифест (start_url — /admin).
  manifest: "/crm.webmanifest",
  appleWebApp: { capable: true, title: "MyBooks CRM", statusBarStyle: "default" as const },
  icons: { apple: "/crm-icon-192.png" },
};

/** Страница установки CRM на экран «Домой» (iPhone и Android). Без входа: сотрудник ставит иконку, дальше входит в самом приложении. */
export default function CrmInstallPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <LogoMark className="size-16" />
        <h1 className="text-2xl font-semibold">MyBooks CRM</h1>
        <p className="text-sm text-muted">Чаты, сделки, заказы и задачи — как приложение на телефоне. Ставится за полминуты, без магазина приложений.</p>
      </div>
      <InstallCrm />
    </main>
  );
}
