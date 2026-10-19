import { Link } from "@/i18n/client";
import { getMessages } from "@/i18n/server";
import { container } from "@/server/container";
import { site } from "@/config/site";
import { ResetForm } from "./ResetForm";

/** wa.me компании с готовым текстом: у клиентов, заведённых по телефону, почты нет — новую ссылку пришлёт менеджер. */
async function whatsappUrl(text: string) {
  const digits = await container()
    .marketing.service.shopWhatsapp()
    .catch(() => site.contacts.whatsapp.replace(/\D/g, ""));
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/**
 * Новый пароль по ссылке: из письма (сброс) или из WhatsApp после оплаты (доступ в кабинет — «Задайте пароль»).
 * Страница только смотрит на ссылку и не тратит её: её открывает и предпросмотр WhatsApp. Погашение — POST формы.
 */
export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [info, m] = await Promise.all([container().identity.auth.linkInfo(token), getMessages()]);
  const t = m.auth.reset;
  const access = info?.purpose === "access";
  const wa = await whatsappUrl(t.writeUsText);
  if (!info?.valid)
    return (
      <div data-testid="reset-invalid">
        <h1 className="font-serif text-4xl font-medium">{t.invalidTitle}</h1>
        <p className="mt-3 mb-8 text-muted">{access || !info ? t.invalidAccess : t.invalidReset}</p>
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
      <h1 className="font-serif text-4xl font-medium">{access ? t.accessTitle : t.title}</h1>
      <p className="mt-2 mb-8 text-muted">{access ? t.accessText : t.text}</p>
      <ResetForm token={token} whatsappUrl={wa} />
    </>
  );
}
