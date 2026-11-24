import { Apple, CheckCircle2, Download, Smartphone } from "lucide-react";
import { env } from "@/config/env";
import { PageHeader } from "@/components/admin/PageHeader";
import { requireStaff } from "@/server/access";
import { hasMobileApk } from "@/server/mobile-apk";
import { iosStatus, iosToken } from "@/server/ios-app";
import { IosEnroll } from "./IosEnroll";

export const metadata = { title: "Приложение для телефона" };
export const dynamic = "force-dynamic";

const NOTICE: Record<string, { tone: "ok" | "warn"; text: string }> = {
  registered: { tone: "ok", text: "iPhone зарегистрирован. Приложение подписывается под него — через минуту здесь появится «Установить на iPhone», придёт и уведомление." },
  expired: { tone: "warn", text: "Профиль устарел — скачайте его ещё раз." },
  failed: { tone: "warn", text: "Телефон не прислал свой идентификатор. Скачайте профиль ещё раз в Safari." },
};

/**
 * Приложение CRM на телефон — для любого сотрудника: Android — APK, iPhone — без App Store: регистрация телефона профилем
 * и установка по ссылке, когда телефон вошёл в сборку (src/server/ios-app.ts, scripts/mobile/ios-adhoc.sh).
 */
export default async function AppPage({ searchParams }: { searchParams: Promise<{ ios?: string }> }) {
  const staff = await requireStaff();
  const [{ ios }, apk, status] = await Promise.all([searchParams, hasMobileApk(), iosStatus(staff.user.id)]);
  const notice = ios ? NOTICE[ios] : undefined;
  const ready = status.devices.some((d) => d.ready);
  const manifest = `${env.appUrl}/api/ios-app/manifest?t=${encodeURIComponent(iosToken(staff.user.id, "install", 3600))}`;
  const install = `itms-services://?action=download-manifest&url=${encodeURIComponent(manifest)}`;
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageHeader title="Приложение для телефона">Чаты, сделки, задачи и уведомления — в приложении CRM.</PageHeader>

      {notice ? <p className={notice.tone === "ok" ? "rounded-[10px] bg-success-bg p-3 text-sm text-success" : "rounded-[10px] bg-warning-bg p-3 text-sm text-warning"}>{notice.text}</p> : null}

      <section className="card space-y-3 p-5" aria-labelledby="ios-title">
        <h2 id="ios-title" className="flex items-center gap-2 text-base font-semibold">
          <Apple className="size-5" strokeWidth={1.8} aria-hidden /> iPhone
        </h2>
        {ready && status.build ? (
          <>
            <p className="text-sm text-muted">Ваш iPhone есть в сборке {status.build.version}. Откройте эту страницу в Safari на телефоне и нажмите:</p>
            <a href={install} className="btn btn-primary">
              <Download className="size-4" strokeWidth={1.8} aria-hidden /> Установить на iPhone
            </a>
            <p className="text-xs text-muted">После установки приложение появится на экране «Домой». Если iOS скажет «Ненадёжный разработчик» — это не про нашу сборку; при ошибке «Не удаётся установить» напишите руководителю.</p>
          </>
        ) : (
          <IosEnroll initial={status} notice={ios} />
        )}
        {status.devices.length ? (
          <ul className="space-y-1 border-t border-line pt-3 text-sm">
            {status.devices.map((d) => (
              <li key={d.id} className="flex items-center gap-2">
                <CheckCircle2 className={d.ready ? "size-4 text-success" : "size-4 text-muted"} strokeWidth={1.8} aria-hidden />
                {d.product || "iPhone"}
                {d.iosVersion ? `, iOS ${d.iosVersion}` : ""} — {d.ready ? "можно устанавливать" : "ждёт сборки"}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="card space-y-3 p-5" aria-labelledby="android-title">
        <h2 id="android-title" className="flex items-center gap-2 text-base font-semibold">
          <Smartphone className="size-5" strokeWidth={1.8} aria-hidden /> Android
        </h2>
        {apk ? (
          <>
            <a href="/api/admin/mobile-apk" className="btn btn-primary" download>
              <Download className="size-4" strokeWidth={1.8} aria-hidden /> Скачать APK
            </a>
            <p className="text-xs text-muted">Откройте скачанный файл и разрешите установку из этого источника. Новая версия ставится поверх старой.</p>
          </>
        ) : (
          <p className="text-sm text-muted">Файл приложения ещё не загружен.</p>
        )}
      </section>
    </div>
  );
}
