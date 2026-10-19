"use client";

import { useActionState, useState, useTransition } from "react";
import { LoaderCircle, PlugZap, Send } from "lucide-react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Section, Status, Result, SecretInput, CheckMessage } from "../ui";
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
    <Section title="Почта для отправки — SMTP" badge={<Status on={configured} label={configured ? "настроена" : "не настроена — письма пишутся в лог"} />}>
      <p className="mb-3 text-sm text-ink-soft">
        Через этот ящик уходят письма клиентам (заказ оформлен и оплачен, сертификаты, сброс пароля, напоминания) и письма менеджеров из CRM. Подойдёт любой почтовый сервис; для Яндекса, Gmail и Mail.ru нужен
        «пароль приложения», а не обычный пароль от ящика.
      </p>
      {fromEnv ? <p className="mb-3 rounded-xl bg-cream px-3 py-2 text-xs text-muted">Почта задана переменными окружения сервера (SMTP_HOST и др.) — здесь только для просмотра и проверки.</p> : null}
      <form action={action} className="space-y-3">
        {!env.host ? (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted">Быстро заполнить:</span>
            {smtpPresets.map((pr) => (
              <button
                key={pr.label}
                type="button"
                className="rounded-full border border-line px-2.5 py-1 hover:bg-cream"
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
        <div className="grid gap-3 sm:grid-cols-[1fr_110px_170px]">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Сервер SMTP</span>
            <input name="smtpHost" value={host} onChange={(e) => setHost(e.target.value)} disabled={env.host} placeholder="smtp.yandex.ru" className="input h-10 text-sm" autoComplete="off" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Порт</span>
            <input name="smtpPort" value={port} onChange={(e) => setPort(e.target.value)} disabled={env.port} className="input h-10 text-sm" inputMode="numeric" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Шифрование</span>
            <select name="smtpSecure" defaultValue={saved.secure} disabled={env.secure} className="input h-10 text-sm">
              <option value="">по порту (465 — SSL)</option>
              <option value="true">SSL/TLS сразу</option>
              <option value="false">STARTTLS</option>
            </select>
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Логин (обычно адрес ящика)</span>
            <input name="smtpUser" defaultValue={saved.user} disabled={env.user} className="input h-10 text-sm" autoComplete="off" />
          </label>
          <SecretInput name="smtpPassword" label="Пароль приложения" saved={saved.password} fromEnv={env.password} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Отправитель</span>
            <input name="mailFrom" defaultValue={saved.from} disabled={env.from} placeholder="MyBooks <hello@mybook.kz>" className="input h-10 text-sm" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Адрес для ответов (необязательно)</span>
            <input name="mailReplyTo" defaultValue={saved.replyTo} disabled={env.replyTo} placeholder="sales@mybook.kz" className="input h-10 text-sm" />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!fromEnv ? <SubmitButton className="btn-sm">Сохранить</SubmitButton> : null}
          <button type="button" className="btn btn-outline btn-sm" disabled={pending || !configured} onClick={() => run(testSmtpAction)}>
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : <PlugZap className="size-4" />} Проверить
          </button>
          <button type="button" className="btn btn-outline btn-sm" disabled={pending || !configured} onClick={() => run(sendTestMailAction)}>
            <Send className="size-4" /> Письмо на {staffEmail}
          </button>
          <Result state={state} />
        </div>
        <CheckMessage check={check} />
        <p className="text-xs text-muted">Отправитель должен совпадать с ящиком (или быть разрешён в нём), иначе сервер отклонит письма. Чтобы письма не попадали в спам, настройте SPF и DKIM для домена.</p>
      </form>
    </Section>
  );
}
