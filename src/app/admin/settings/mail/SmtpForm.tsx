"use client";

import { useActionState, useState, useTransition } from "react";
import { LoaderCircle, PlugZap, Send } from "lucide-react";
import { Actions, CheckMessage, Field, Group, Help, Note, Result, SaveButton, Section, SecretInput } from "../ui";
import type { SettingsState } from "../state";
import { saveSmtpAction, testSmtpAction, sendTestMailAction } from "./actions";

const smtpPresets = [
  { label: "Яндекс", host: "smtp.yandex.ru", port: "465" },
  { label: "Gmail", host: "smtp.gmail.com", port: "465" },
  { label: "Mail.ru", host: "smtp.mail.ru", port: "465" },
  { label: "Outlook / Microsoft 365", host: "smtp.office365.com", port: "587" },
];

export function SmtpForm({
  saved,
  fromEnv,
  staffEmail,
}: {
  saved: { host: string; port: string; secure: string; user: string; password: string; from: string; replyTo: string };
  fromEnv: boolean;
  staffEmail: string;
}) {
  const env = { host: fromEnv, port: fromEnv, secure: fromEnv, user: fromEnv, password: fromEnv, from: fromEnv, replyTo: fromEnv };
  const [state, action] = useActionState<SettingsState, FormData>(saveSmtpAction, {});
  const [check, setCheck] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const [host, setHost] = useState(saved.host);
  const [port, setPort] = useState(saved.port);
  const configured = !!saved.host;
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) => start(async () => setCheck(await fn()));
  return (
    <Section
      id="smtp"
      title="Почта для отправки: SMTP"
      description="Через этот ящик уходят письма клиентам и письма менеджеров из CRM"
      status={configured ? { tone: "ok", label: "настроена" } : { tone: "warn", label: "не настроена: письма пишутся в лог" }}
      actions={
        <button type="button" className="btn btn-outline btn-sm" disabled={pending || !configured} onClick={() => run(testSmtpAction)}>
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <PlugZap className="size-4" aria-hidden />} Проверить
        </button>
      }
    >
      <CheckMessage check={check} />
      {fromEnv ? <p className="mb-4 max-w-[40rem] rounded-[var(--r-ctl)] bg-info-bg px-3 py-2 text-sm text-info">Почта задана переменными окружения сервера (SMTP_HOST и др.): здесь только для просмотра и проверки.</p> : null}
      <form action={action} className="space-y-5">
        <Help title="Что за письма и какой нужен пароль" open={!configured}>
          <p>
            Письма клиентам: заказ оформлен и оплачен, сертификаты, сброс пароля, напоминания, и письма менеджеров из CRM. Подойдёт любой почтовый сервис; для Яндекса, Gmail и Mail.ru нужен «пароль приложения», а не обычный пароль от ящика.
          </p>
        </Help>
        <Group title="Сервер" hint="Адрес почтового сервера, порт и шифрование.">
          {!env.host ? (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted">Быстро заполнить:</span>
              {smtpPresets.map((pr) => (
                <button
                  key={pr.label}
                  type="button"
                  className="chip"
                  onClick={() => {
                    setHost(pr.host);
                    setPort(pr.port);
                  }}
                >
                  {pr.label}
                </button>
              ))}
            </div>
          ) : null}
          <Field label="Сервер SMTP">
            <input name="smtpHost" value={host} onChange={(e) => setHost(e.target.value)} disabled={env.host} placeholder="smtp.yandex.ru" className="input" autoComplete="off" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Порт">
              <input name="smtpPort" value={port} onChange={(e) => setPort(e.target.value)} disabled={env.port} className="input" inputMode="numeric" />
            </Field>
            <Field label="Шифрование">
              <select name="smtpSecure" defaultValue={saved.secure} disabled={env.secure} className="input">
                <option value="">по порту (465 — SSL)</option>
                <option value="true">SSL/TLS сразу</option>
                <option value="false">STARTTLS</option>
              </select>
            </Field>
          </div>
        </Group>
        <Group title="Вход в ящик" hint="Логин и пароль приложения от ящика отправителя.">
          <Field label="Логин (обычно адрес ящика)">
            <input name="smtpUser" defaultValue={saved.user} disabled={env.user} className="input" autoComplete="off" />
          </Field>
          <SecretInput name="smtpPassword" label="Пароль приложения" saved={saved.password} fromEnv={env.password} />
        </Group>
        <Group title="Отправитель" hint="Как письма выглядят у получателя.">
          <Field label="Отправитель" hint="Должен совпадать с ящиком (или быть разрешён в нём), иначе сервер отклонит письма.">
            <input name="mailFrom" defaultValue={saved.from} disabled={env.from} placeholder="MyBooks <hello@mybook.kz>" className="input" />
          </Field>
          <Field label="Адрес для ответов" optional>
            <input name="mailReplyTo" defaultValue={saved.replyTo} disabled={env.replyTo} placeholder="sales@mybook.kz" className="input" />
          </Field>
        </Group>
        <Note>Чтобы письма не попадали в спам, настройте SPF и DKIM для домена.</Note>
        <Actions>
          {!fromEnv ? <SaveButton /> : null}
          <button type="button" className="btn btn-outline" disabled={pending || !configured} onClick={() => run(sendTestMailAction)}>
            <Send className="size-4" aria-hidden /> Письмо на {staffEmail}
          </button>
          <Result state={state} />
        </Actions>
      </form>
    </Section>
  );
}
