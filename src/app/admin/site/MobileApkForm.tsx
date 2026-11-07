"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Download, LoaderCircle, Upload } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Group, Section } from "../settings/ui";

/** Загрузка APK для продажников: файл уходит в API напрямую (больше лимита server actions). */
export function MobileApkForm({ uploaded }: { uploaded: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setError(null);
    setOk(null);
    setPending(true);
    try {
      const res = await fetch("/api/admin/mobile-apk", { method: "POST", body: new FormData(form) });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Не удалось загрузить файл");
        return;
      }
      form.reset();
      setOk("APK загружен. Ссылка «Скачать APK» уже отдаёт новую версию.");
      router.refresh();
    } catch {
      setError("Нет связи с сервером. Попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Section
      id="apk"
      title="Приложение продажника (Android)"
      description={uploaded ? "Скачивание доступно только сотрудникам, вошедшим в CRM" : "Загрузите APK — сотрудники скачают его по ссылке из CRM"}
      status={uploaded ? { tone: "ok", label: "загружено" } : { tone: "off", label: "не загружено" }}
      actions={
        uploaded ? (
          <a href="/api/admin/mobile-apk" className="btn btn-outline btn-sm" download>
            <Download className="size-4" strokeWidth={1.8} aria-hidden /> Скачать APK
          </a>
        ) : null
      }
    >
      <div className="space-y-5" data-testid="mobile-apk-form">
        <Group title={uploaded ? "Новая версия" : "Файл приложения"} hint="Файл уходит на сервер напрямую и сразу становится доступен по ссылке «Скачать APK».">
          <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-3">
            <label className="label sr-only" htmlFor="apk-file">
              Файл APK
            </label>
            <input
              id="apk-file"
              type="file"
              name="apk"
              accept=".apk,application/vnd.android.package-archive"
              required
              className="min-w-0 flex-1 basis-60 text-sm text-ink-soft file:mr-3 file:h-9 file:cursor-pointer file:rounded-[var(--r-ctl)] file:border file:border-line-strong file:bg-white file:px-3.5 file:text-sm file:font-medium file:text-ink hover:file:bg-sunken"
            />
            <button type="submit" className="btn btn-dark" disabled={pending}>
              {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" strokeWidth={1.8} aria-hidden />}
              {pending ? "Загружаю…" : uploaded ? "Загрузить новую версию" : "Загрузить APK"}
            </button>
          </form>
        </Group>
        {error ? <Alert>{error}</Alert> : null}
        {ok ? <Alert kind="success">{ok}</Alert> : null}
      </div>
    </Section>
  );
}
