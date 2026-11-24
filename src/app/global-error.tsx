"use client";

import { clientLocale } from "@/i18n/config";
import { common as kk } from "@/i18n/messages/kk/common";
import { common as ru } from "@/i18n/messages/ru/common";
import { common as uz } from "@/i18n/messages/uz/common";
import { common as en } from "@/i18n/messages/en/common";
import { useStaleReload } from "@/components/useStaleReload";

/**
 * Ошибка выше корневого layout — например, не загрузился чанк словаря (I18nProvider): обычной error.tsx
 * и useMessages здесь нет, поэтому тексты — прямо из общих словарей, язык — по адресу страницы.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  const locale = clientLocale();
  const m = { ru, kk, uz, en }[locale];
  // Ошибка от прошлой версии страницы (после выкатки) — сразу перезагрузка, без страницы ошибки.
  const reloading = useStaleReload(error);
  // Ни стилей, ни шрифтов сайта здесь может не быть — тёмный «кадр» на встроенных стилях.
  return (
    <html lang={locale}>
      <body style={{ visibility: reloading ? "hidden" : undefined, margin: 0, minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, boxSizing: "border-box", fontFamily: "system-ui, sans-serif", background: "#211819", color: "#fff" }}>
        <main style={{ width: "100%", maxWidth: 520, padding: "56px 28px", boxSizing: "border-box", textAlign: "center", border: "1px solid rgba(255,255,255,.26)" }}>
          <h1 style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: 34, lineHeight: 1.1, fontWeight: 500 }}>{m.errorPage.title}</h1>
          <p style={{ margin: "16px auto 0", maxWidth: 400, color: "rgba(255,255,255,.8)", lineHeight: 1.6 }}>{m.errorPage.text}</p>
          <button onClick={() => location.reload()} style={{ marginTop: 28, height: 48, padding: "0 24px", borderRadius: 10, border: 0, background: "#7a1f2b", color: "#fff", fontSize: 16, fontWeight: 500, cursor: "pointer" }}>
            {m.actions.retry}
          </button>
        </main>
      </body>
    </html>
  );
}
