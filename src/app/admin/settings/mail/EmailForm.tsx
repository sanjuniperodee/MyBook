"use client";

import { useActionState, useState, useTransition } from "react";
import { LoaderCircle, PlugZap } from "lucide-react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Intro } from "@/components/admin/Intro";
import { Section, Status, Result, CopyField, SecretInput, CheckMessage, rotateToken } from "../ui";
import type { SettingsState } from "../state";
import { saveEmailAction, testImapAction } from "./actions";

export function EmailForm({ smtp, saved, env, webhookUrl }: { smtp: boolean; saved: { imapHost: string; imapPort: string; imapUser: string; imapPassword: string; imapMailbox: string }; env: { imapHost: boolean; imapPort: boolean; imapUser: boolean; imapPassword: boolean }; webhookUrl: string | null }) {
  const [state, action] = useActionState<SettingsState, FormData>(saveEmailAction, {});
  const [check, setCheck] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const inbound = !!(saved.imapHost && saved.imapUser && (saved.imapPassword || env.imapPassword));
  return (
    <Section defaultOpen={false} title="Почта — e-mail как канал" badge={<Status on={inbound} label={inbound ? "входящие подключены" : "только исходящие"} />}>
      <Intro className="mb-4">
        Менеджеры пишут клиентам из карточек сделки, клиента и заказа, а ответы приходят в «Чаты» рядом с WhatsApp. Исходящие уходят через SMTP —{" "}
        {smtp ? <span className="text-emerald-700">настроен</span> : <span className="text-red-700">не настроен — заполните блок «Почта для отправки» выше</span>}.
      </Intro>
      <form action={action} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Сервер IMAP входящего ящика</span>
            <input name="imapHost" defaultValue={saved.imapHost} disabled={env.imapHost} placeholder="imap.yandex.ru, imap.gmail.com…" className="input h-10 text-sm" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Порт</span>
            <input name="imapPort" defaultValue={saved.imapPort} disabled={env.imapPort} className="input h-10 text-sm" inputMode="numeric" />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Логин (адрес ящика)</span>
            <input name="imapUser" defaultValue={saved.imapUser} disabled={env.imapUser} className="input h-10 text-sm" autoComplete="off" />
          </label>
          <SecretInput name="imapPassword" label="Пароль приложения" saved={saved.imapPassword} fromEnv={env.imapPassword} />
        </div>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Папка</span>
          <input name="imapMailbox" defaultValue={saved.imapMailbox} className="input h-10 w-48 text-sm" />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton className="btn-sm">Сохранить</SubmitButton>
          <button type="button" className="btn btn-outline btn-sm" disabled={pending || !inbound} onClick={() => start(async () => setCheck(await testImapAction()))}>
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : <PlugZap className="size-4" />} Проверить
          </button>
          <Result state={state} />
        </div>
        <CheckMessage check={check} />
        <p className="text-xs text-muted">Новые письма забираются раз в минуту. Для Яндекса и Gmail нужен «пароль приложения» и включённый IMAP в настройках ящика.</p>
        {webhookUrl ? <CopyField label="Или вебхук для почтового сервиса (Mailgun, Postmark, SendGrid Inbound Parse): POST с полями from, subject, text" value={webhookUrl} onRotate={() => rotateToken("email.webhookToken")} /> : null}
      </form>
    </Section>
  );
}
