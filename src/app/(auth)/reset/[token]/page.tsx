import { Link } from "@/i18n/client";
import { getLocale, getMessages } from "@/i18n/server";
import { v1WebRead } from "@/web/api";
import { AuthHead } from "../../AuthHead";
import { ResetForm } from "./ResetForm";

/**
 * Новый пароль по ссылке: из письма (сброс) или из WhatsApp после оплаты (доступ в кабинет — «Задайте пароль»).
 * Страница только смотрит на ссылку и не тратит её: её открывает и предпросмотр WhatsApp. Погашение — POST формы.
 */
export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const info = await v1WebRead({
    name: "cabinet.resetInfo",
    section: "cabinet",
    locale,
    viaApi: (api) => api.webAuthResetInfo({ token }),
  });
  const t = m.auth.reset;
  const access = info.purpose === "access";
  const wa = `https://wa.me/${info.shopWhatsappDigits}?text=${encodeURIComponent(t.writeUsText)}`;
  if (!info.valid)
    return (
      <div data-testid="reset-invalid">
        <AuthHead title={t.invalidTitle} text={access || !info.purpose ? t.invalidAccess : t.invalidReset} />
        <div className="flex flex-col gap-3 sm:flex-row">
          <a href={wa} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
            {t.writeUs}
          </a>
          {access ? (
            <Link href="/login" className="btn btn-outline">
              {t.toLogin}
            </Link>
          ) : (
            <Link href="/forgot" className="btn btn-outline">
              {t.requestNew}
            </Link>
          )}
        </div>
      </div>
    );
  return (
    <>
      <AuthHead title={access ? t.accessTitle : t.title} text={access ? t.accessText : t.text} />
      <ResetForm token={token} whatsappUrl={wa} />
    </>
  );
}
