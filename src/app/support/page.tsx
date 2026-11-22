import type { Metadata } from "next";
import { PlainShell } from "@/components/landing/PlainShell";
import { getStaff } from "@/server/access";
import { FILE_MAX_BYTES, FILES_MAX } from "@/modules/support";
import { SupportForm } from "./SupportForm";

export const metadata: Metadata = { title: "Обращение в поддержку MyBooks", robots: { index: false } };

const param = (v: string | string[] | undefined, max = 300) => (typeof v === "string" ? v.slice(0, max) : "");

/**
 * Обращение: что не работает или что нужно изменить — текстом, голосом, скриншотами и видео; номер WhatsApp, куда
 * написать, когда исправим. Без входа. ?client=, ?place=, ?phone=, ?name= — заполнить заранее (ссылка из CRM).
 */
export default async function SupportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const staff = await getStaff().catch(() => null);
  return (
    <PlainShell size="md" lang={false}>
      <h1 className="font-serif text-[34px] leading-[1.05] font-medium text-balance sm:text-[42px]">Обращение в поддержку</h1>
      <p className="mt-3 max-w-[60ch] leading-relaxed text-ink-soft">
        Расскажите, что не так или что нужно сделать, — как удобно: текстом, голосом, скриншотами, видео с экрана. Можно приложить пересланные голосовые клиента.
        Когда исправим, напишем в WhatsApp на ваш номер.
      </p>
      <SupportForm
        className="mt-8"
        filesMax={FILES_MAX}
        fileMaxMb={FILE_MAX_BYTES / 1024 / 1024}
        staff={!!staff}
        initial={{
          reporterName: param(sp.name, 120) || staff?.user.name || "",
          notifyPhone: param(sp.phone, 40) || staff?.user.phone || "",
          clientPhone: param(sp.client, 40),
          place: param(sp.place, 1000),
        }}
      />
    </PlainShell>
  );
}
