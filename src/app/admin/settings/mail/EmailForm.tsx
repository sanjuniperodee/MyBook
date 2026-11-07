"use client";

import { useActionState, useState, useTransition } from "react";
import { LoaderCircle, PlugZap } from "lucide-react";
import { Actions, CheckMessage, CopyField, Field, Group, Note, Result, SaveButton, Section, SecretInput, rotateToken } from "../ui";
import type { SettingsState } from "../state";
import { saveEmailAction, testImapAction } from "./actions";

export function EmailForm({ smtp, saved, env, webhookUrl }: { smtp: boolean; saved: { imapHost: string; imapPort: string; imapUser: string; imapPassword: string; imapMailbox: string }; env: { imapHost: boolean; imapPort: boolean; imapUser: boolean; imapPassword: boolean }; webhookUrl: string | null }) {
  const [state, action] = useActionState<SettingsState, FormData>(saveEmailAction, {});
  const [check, setCheck] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const inbound = !!(saved.imapHost && saved.imapUser && (saved.imapPassword || env.imapPassword));
  return (
    <Section
      id="imap"
      defaultOpen={false}
      title="Почта как канал: входящие (IMAP)"
      description="Ответы клиентов приходят в «Чаты» рядом с WhatsApp"
      status={inbound ? { tone: "ok", label: "входящие подключены" } : { tone: "off", label: "только исходящие" }}
      actions={
        <button type="button" className="btn btn-outline btn-sm" disabled={pending || !inbound} onClick={() => start(async () => setCheck(await testImapAction()))}>
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <PlugZap className="size-4" aria-hidden />} Проверить
        </button>
      }
    >
      <CheckMessage check={check} />
      <form action={action} className="space-y-5">
        <Note>
          Менеджеры пишут клиентам из карточек сделки, клиента и заказа, а ответы приходят в «Чаты» рядом с WhatsApp. Исходящие уходят через SMTP:{" "}
          {smtp ? <span className="text-success">настроен</span> : <span className="text-danger">не настроен, заполните лист «Почта для отправки» выше</span>}.
        </Note>
        <Group title="Входящий ящик" hint="Новые письма забираются раз в минуту. Для Яндекса и Gmail нужен «пароль приложения» и включённый IMAP в настройках ящика.">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem]">
            <Field label="Сервер IMAP">
              <input name="imapHost" defaultValue={saved.imapHost} disabled={env.imapHost} placeholder="imap.yandex.ru, imap.gmail.com…" className="input" />
            </Field>
            <Field label="Порт">
              <input name="imapPort" defaultValue={saved.imapPort} disabled={env.imapPort} className="input" inputMode="numeric" />
            </Field>
          </div>
          <Field label="Логин (адрес ящика)">
            <input name="imapUser" defaultValue={saved.imapUser} disabled={env.imapUser} className="input" autoComplete="off" />
          </Field>
          <SecretInput name="imapPassword" label="Пароль приложения" saved={saved.imapPassword} fromEnv={env.imapPassword} />
          <Field label="Папка" className="w-56">
            <input name="imapMailbox" defaultValue={saved.imapMailbox} className="input w-56" />
          </Field>
        </Group>
        {webhookUrl ? (
          <Group title="Вебхук вместо IMAP" hint="Для почтового сервиса: Mailgun, Postmark, SendGrid Inbound Parse.">
            <CopyField label="Адрес: POST с полями from, subject, text" value={webhookUrl} onRotate={() => rotateToken("email.webhookToken")} />
          </Group>
        ) : null}
        <Actions>
          <SaveButton />
          <Result state={state} />
        </Actions>
      </form>
    </Section>
  );
}
