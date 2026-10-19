"use client";

import { clientLocale } from "@/i18n/config";
import { common as kk } from "@/i18n/messages/kk/common";
import { common as ru } from "@/i18n/messages/ru/common";

/**
 * Ошибка выше корневого layout — например, не загрузился чанк словаря (I18nProvider): обычной error.tsx
 * и useMessages здесь нет, поэтому тексты — прямо из общих словарей, язык — по адресу страницы.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const locale = clientLocale();
  const m = locale === "kk" ? kk : ru;
  return (
    <html lang={locale}>
      <body style={{ margin: 0, minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center", fontFamily: "system-ui, sans-serif", background: "#faf7f2", color: "#2b2420" }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 500 }}>{m.errorPage.title}</h1>
        <p style={{ margin: 0, maxWidth: 420, color: "#7a7068" }}>{m.errorPage.text}</p>
        <button onClick={() => (reset(), location.reload())} style={{ padding: "10px 20px", borderRadius: 999, border: 0, background: "#7a2633", color: "#fff", fontSize: 15, cursor: "pointer" }}>
          {m.actions.retry}
        </button>
      </body>
    </html>
  );
}
