"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";

/** Загрузка APK для продажников: файл уходит в API напрямую (больше лимита server actions). */
export function MobileApkForm({ uploaded }: { uploaded: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setError(null);
    setOk(null);
    try {
      const res = await fetch("/api/admin/mobile-apk", { method: "POST", body: new FormData(form) });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Не удалось загрузить файл");
        return;
      }
      form.reset();
      setOk("APK загружен. Ссылка ниже уже отдаёт новую версию.");
      router.refresh();
    } catch {
      setError("Нет связи с сервером. Попробуйте ещё раз.");
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-white p-5" data-testid="mobile-apk-form">
      <div>
        <h2 className="font-medium">Приложение продажника (Android)</h2>
        <p className="mt-1 text-sm text-muted">
          {uploaded ? "APK загружен. Скачивание доступно только сотрудникам, войдя в CRM." : "APK ещё не загружен."}
        </p>
      </div>
      {uploaded ? (
        <a href="/api/admin/mobile-apk" className="btn btn-ghost inline-flex" download>
          Скачать APK
        </a>
      ) : null}
      <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-3">
        <input type="file" name="apk" accept=".apk,application/vnd.android.package-archive" required className="text-sm" />
        <SubmitButton className="btn btn-primary" pendingText="Загружаю…">
          Загрузить APK
        </SubmitButton>
      </form>
      {error ? <Alert>{error}</Alert> : null}
      {ok ? (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
          {ok}
        </p>
      ) : null}
    </section>
  );
}
