"use client";

import { useActionState, useState, useTransition } from "react";
import { CheckCircle2, Copy, LoaderCircle, PlugZap, RefreshCw, Trash2, XCircle } from "lucide-react";
import { ask, toast, toastError } from "@/components/ui/overlays";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { cn } from "@/lib/utils";
import {
  deleteTemplateAction,
  registerWazzupWebhookAction,
  rotateTokenAction,
  saveCrmSettingsAction,
  saveTelephonyAction,
  saveTemplateAction,
  saveWazzupAction,
  testWazzupAction,
  saveAiAction,
  testAiAction,
  saveEmailAction,
  testImapAction,
  type SettingsState,
} from "./actions";
import { unblockAction } from "../deals/actions";

function Section({ title, badge, children }: { title: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="font-semibold">{title}</h2>
        {badge}
      </div>
      {children}
    </section>
  );
}

const Status = ({ on, label }: { on: boolean; label: string }) => (
  <span className={cn("rounded-full px-2.5 py-0.5 text-xs", on ? "bg-emerald-100 text-emerald-800" : "bg-cream text-muted")}>{label}</span>
);

function Result({ state }: { state: SettingsState }) {
  if (state.error) return <span className="text-xs text-red-700">{state.error}</span>;
  if (state.ok) return <span className="text-xs text-emerald-700">{state.ok}</span>;
  return null;
}

function CopyField({ label, value, onRotate }: { label: string; value: string; onRotate?: () => void }) {
  return (
    <div>
      <div className="mb-1 text-xs text-muted">{label}</div>
      <div className="flex gap-2">
        <input readOnly value={value} className="input h-9 min-w-0 flex-1 font-mono text-xs" onFocus={(e) => e.target.select()} />
        <button type="button" className="btn btn-outline btn-sm h-9" onClick={() => navigator.clipboard.writeText(value).then(() => toast("Скопировано"))} aria-label="Скопировать">
          <Copy className="size-4" />
        </button>
        {onRotate ? (
          <button type="button" className="btn btn-ghost btn-sm h-9" onClick={onRotate} title="Выпустить новый токен (старый адрес перестанет работать)" aria-label="Новый токен">
            <RefreshCw className="size-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SecretInput({ name, label, saved, fromEnv, placeholder }: { name: string; label: string; saved: string; fromEnv: boolean; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <input name={name} type="password" autoComplete="off" disabled={fromEnv} placeholder={fromEnv ? "задан в переменных окружения" : saved ? `сохранён ${saved} — оставьте пустым, чтобы не менять` : (placeholder ?? "")} className="input h-10 text-sm" />
      {saved && !fromEnv ? (
        <span className="mt-1 flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" name={`${name}Clear`} className="accent-wine" /> удалить сохранённый
        </span>
      ) : null}
    </label>
  );
}

export function WazzupForm({ saved, env, webhookUrl }: { saved: { apiKey: string; baseUrl: string; channelId: string }; env: { apiKey: boolean; baseUrl: boolean; channelId: boolean }; webhookUrl: string | null }) {
  const [state, action] = useActionState<SettingsState, FormData>(saveWazzupAction, {});
  const [channels, setChannels] = useState<{ id: string; label: string; state: string }[] | null>(null);
  const [check, setCheck] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const connected = !!saved.apiKey || env.apiKey;
  return (
    <Section title="WhatsApp, Instagram, Telegram — Wazzup" badge={<Status on={connected} label={connected ? "ключ сохранён" : "не подключено"} />}>
      <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-ink-soft">
        <li>В личном кабинете Wazzup откройте «Интеграции → API» и скопируйте ключ.</li>
        <li>Вставьте ключ ниже и сохраните, затем нажмите «Проверить» и выберите канал WhatsApp для исходящих.</li>
        <li>Нажмите «Подключить вебхук» — входящие сообщения начнут появляться в разделе «Чаты».</li>
      </ol>
      <form action={action} className="space-y-3">
        <SecretInput name="apiKey" label="API-ключ Wazzup" saved={saved.apiKey} fromEnv={env.apiKey} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Канал для первых сообщений (channelId)</span>
            {channels?.length ? (
              <select name="channelId" defaultValue={saved.channelId} disabled={env.channelId} className="input h-10 text-sm">
                <option value="">— не выбран —</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} {c.state !== "active" ? `(${c.state})` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <input name="channelId" defaultValue={saved.channelId} disabled={env.channelId} placeholder="нажмите «Проверить», чтобы выбрать" className="input h-10 font-mono text-xs" />
            )}
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Адрес API (обычно не меняется)</span>
            <input name="baseUrl" defaultValue={saved.baseUrl} disabled={env.baseUrl} className="input h-10 text-sm" />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton className="btn-sm">Сохранить</SubmitButton>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={pending || !connected}
            onClick={() =>
              start(async () => {
                const r = await testWazzupAction();
                setCheck(r);
                if (r.channels) setChannels(r.channels);
              })
            }
          >
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : <PlugZap className="size-4" />} Проверить
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={pending || !connected}
            onClick={() => start(async () => setCheck(await registerWazzupWebhookAction()))}
          >
            Подключить вебхук
          </button>
          <Result state={state} />
        </div>
        {check ? (
          <p className={cn("flex items-center gap-1.5 text-sm", check.ok ? "text-emerald-700" : "text-red-700")}>
            {check.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />} {check.message}
          </p>
        ) : null}
        {webhookUrl ? <CopyField label="Адрес вебхука (если подключаете вручную)" value={webhookUrl} onRotate={() => rotate("wazzup.webhookToken")} /> : null}
      </form>
    </Section>
  );
}

export function EmailForm({ smtp, saved, env, webhookUrl }: { smtp: boolean; saved: { imapHost: string; imapPort: string; imapUser: string; imapPassword: string; imapMailbox: string }; env: { imapHost: boolean; imapPort: boolean; imapUser: boolean; imapPassword: boolean }; webhookUrl: string | null }) {
  const [state, action] = useActionState<SettingsState, FormData>(saveEmailAction, {});
  const [check, setCheck] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const inbound = !!(saved.imapHost && saved.imapUser && (saved.imapPassword || env.imapPassword));
  return (
    <Section title="Почта — e-mail как канал" badge={<Status on={inbound} label={inbound ? "входящие подключены" : "только исходящие"} />}>
      <p className="mb-3 text-sm text-ink-soft">
        Менеджеры пишут клиентам из карточек сделки, клиента и заказа, а ответы приходят в «Чаты» рядом с WhatsApp. Исходящие уходят через SMTP сервера —{" "}
        {smtp ? <span className="text-emerald-700">настроен</span> : <span className="text-red-700">не настроен (переменные SMTP_HOST, SMTP_USER, SMTP_PASSWORD, MAIL_FROM)</span>}.
      </p>
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
        {check ? (
          <p className={cn("flex items-center gap-1.5 text-sm", check.ok ? "text-emerald-700" : "text-red-700")}>
            {check.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />} {check.message}
          </p>
        ) : null}
        <p className="text-xs text-muted">Новые письма забираются раз в минуту. Для Яндекса и Gmail нужен «пароль приложения» и включённый IMAP в настройках ящика.</p>
        {webhookUrl ? <CopyField label="Или вебхук для почтового сервиса (Mailgun, Postmark, SendGrid Inbound Parse): POST с полями from, subject, text" value={webhookUrl} onRotate={() => rotate("email.webhookToken")} /> : null}
      </form>
    </Section>
  );
}

export function AiForm({ saved, env, enabled, knowledge }: { saved: { apiKey: string; baseUrl: string }; env: { apiKey: boolean; baseUrl: boolean }; enabled: boolean; knowledge: string }) {
  const [state, action] = useActionState<SettingsState, FormData>(saveAiAction, {});
  const [check, setCheck] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const connected = !!saved.apiKey || env.apiKey;
  return (
    <Section title="AI-помощник — Claude" badge={<Status on={connected && enabled} label={!connected ? "не подключён" : enabled ? "включён" : "выключен"} />}>
      <p className="mb-3 text-sm text-ink-soft">
        Подсказывает ответ клиенту в чате, делает резюме сделки со следующим шагом и сам заполняет поля (повод, дата, для кого) из переписки. Работает на модели Claude от Anthropic; ключ API создаётся в консоли{" "}
        <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-wine underline">
          platform.claude.com
        </a>
        . Если основная модель откажется отвечать на запрос, Anthropic автоматически повторит его на резервной модели.
      </p>
      <form action={action} className="space-y-3">
        <SecretInput name="aiKey" label="Ключ Claude API" saved={saved.apiKey} fromEnv={env.apiKey} placeholder="sk-ant-…" />
        <label className="block">
          <span className="mb-1 block text-xs text-muted">База знаний для ответов: правила, сроки, ответы на частые вопросы (тарифы и цены AI берёт с сайта сам)</span>
          <textarea name="knowledge" defaultValue={knowledge} rows={5} maxLength={6000} className="input py-2 text-sm" placeholder="Например: скидки больше 15% согласовываем с руководителем; печать 5–7 рабочих дней; можно добавить до 200 фото…" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="enabled" defaultChecked={enabled} className="accent-wine" /> Показывать AI-кнопки менеджерам
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Адрес API (обычно не меняется)</span>
            <input name="aiBaseUrl" defaultValue={saved.baseUrl} disabled={env.baseUrl} className="input h-10 text-sm" />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton className="btn-sm">Сохранить</SubmitButton>
          <button type="button" className="btn btn-outline btn-sm" disabled={pending || !connected} onClick={() => start(async () => setCheck(await testAiAction()))}>
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : <PlugZap className="size-4" />} Проверить
          </button>
          <Result state={state} />
        </div>
        {check ? (
          <p className={cn("flex items-center gap-1.5 text-sm", check.ok ? "text-emerald-700" : "text-red-700")}>
            {check.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />} {check.message}
          </p>
        ) : null}
        <p className="text-xs text-muted">Расшифровка записей звонков пока не поддерживается: Claude работает с текстом, а не со звуком.</p>
      </form>
    </Section>
  );
}

async function rotate(key: "wazzup.webhookToken" | "pbx.token" | "email.webhookToken") {
  if (!(await ask("Выпустить новый токен? Старый адрес вебхука перестанет работать — его нужно будет заменить у провайдера.", true))) return;
  try {
    await rotateTokenAction(key);
    toast("Новый токен выпущен");
  } catch (e) {
    toastError(e);
  }
}

export function TelephonyForm({
  provider,
  providerFromEnv,
  zadarma,
  zadarmaUrl,
  pbxUrl,
}: {
  provider: "off" | "zadarma" | "pbx";
  providerFromEnv: boolean;
  zadarma: { key: string; secret: string; keyEnv: boolean; secretEnv: boolean; pbxId: string; pbxIdEnv: boolean; webphone: boolean };
  zadarmaUrl: string;
  pbxUrl: string | null;
}) {
  const [state, action] = useActionState<SettingsState, FormData>(saveTelephonyAction, {});
  const [p, setP] = useState(provider);
  return (
    <Section title="Телефония" badge={<Status on={provider !== "off"} label={provider === "off" ? "не подключена" : provider === "zadarma" ? "Zadarma" : "своя АТС"} />}>
      <form action={action} className="space-y-4">
        <div className="flex flex-wrap gap-2 text-sm">
          {(
            [
              ["off", "Выключена"],
              ["zadarma", "Zadarma"],
              ["pbx", "Другая АТС (вебхук)"],
            ] as const
          ).map(([v, label]) => (
            <label key={v} className={cn("flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2", p === v ? "border-wine/40 bg-rose/30" : "border-line")}>
              <input type="radio" name="provider" value={v} checked={p === v} onChange={() => setP(v)} disabled={providerFromEnv} className="accent-wine" />
              {label}
            </label>
          ))}
        </div>
        {p === "zadarma" ? (
          <div className="space-y-3">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-soft">
              <li>В кабинете Zadarma: «Настройки → Интеграции и API» — скопируйте Key и Secret.</li>
              <li>Там же включите «Уведомления о звонках в АТС» и укажите адрес ниже. Отметьте события: начало и конец входящего, ответ, исходящие, запись.</li>
              <li>Внутренние номера сотрудников (100, 101…) укажите в разделе «Команда» — так звонки распределятся по менеджерам, а кнопка «Позвонить» заработает.</li>
            </ol>
            <div className="grid gap-3 sm:grid-cols-2">
              <SecretInput name="zadarmaKey" label="Key" saved={zadarma.key} fromEnv={zadarma.keyEnv} />
              <SecretInput name="zadarmaSecret" label="Secret" saved={zadarma.secret} fromEnv={zadarma.secretEnv} />
            </div>
            <CopyField label="Адрес для уведомлений Zadarma" value={zadarmaUrl} />
            <div className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-[180px_1fr] sm:items-end">
              <label className="block">
                <span className="mb-1 block text-xs text-muted">Номер АТС (для веб-телефона)</span>
                <input name="pbxId" defaultValue={zadarma.pbxId} disabled={zadarma.pbxIdEnv} placeholder="например, 12345" className="input h-10 text-sm" inputMode="numeric" />
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="webphone" defaultChecked={zadarma.webphone} className="mt-0.5 size-4 accent-wine" />
                <span>
                  Веб-телефон в CRM: звонки и входящие прямо в браузере, без софтфона
                  <span className="block text-xs text-muted">Номер АТС — в кабинете Zadarma, «Моя АТС» (SIP-логины вида 12345-100). В «Команде» у сотрудника должен быть указан внутренний номер.</span>
                </span>
              </label>
            </div>
          </div>
        ) : null}
        {p === "pbx" ? (
          <div className="space-y-3 text-sm text-ink-soft">
            <p>Любая АТС (Asterisk, FreePBX, Mango, Beeline и др. через их вебхуки) может присылать события звонков POST-запросом с JSON:</p>
            <pre className="overflow-x-auto rounded-xl bg-[#1f1b18] p-3 text-xs text-[#f3e9dc]">{`{
  "event": "start" | "answer" | "end" | "record",
  "callId": "уникальный id звонка",
  "direction": "in" | "out",
  "phone": "+77011234567",
  "extension": "101",
  "status": "answered" | "missed" | "busy" | "failed",
  "duration": 125,
  "recordingUrl": "https://…/record.mp3"
}`}</pre>
            {pbxUrl ? <CopyField label="Адрес вебхука (токен можно передать и заголовком X-Token)" value={pbxUrl} onRotate={() => rotate("pbx.token")} /> : <p className="text-xs">Сохраните настройку — адрес с токеном появится здесь.</p>}
          </div>
        ) : null}
        <div className="flex items-center gap-3">
          <SubmitButton className="btn-sm">Сохранить</SubmitButton>
          <Result state={state} />
        </div>
      </form>
    </Section>
  );
}

const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function CrmSettingsForm({
  slaMinutes,
  workHours,
  autoDealFrom,
  unsorted,
  maxDiscount,
  widget,
}: {
  slaMinutes: number;
  workHours: { days: number[]; from: string; to: string };
  autoDealFrom: string;
  unsorted: boolean;
  maxDiscount: number;
  widget: { enabled: boolean; chat: boolean };
}) {
  const [state, action] = useActionState<SettingsState, FormData>(saveCrmSettingsAction, {});
  return (
    <Section title="Отдел продаж">
      <form action={action} className="space-y-5">
        <div>
          <span className="mb-1.5 block text-xs text-muted">Рабочее время (Алматы)</span>
          <div className="flex flex-wrap items-center gap-2">
            {weekdays.map((d, i) => (
              <label key={d} className="flex cursor-pointer items-center gap-1 rounded-lg border border-line px-2 py-1.5 text-sm has-checked:border-wine/40 has-checked:bg-rose/40">
                <input type="checkbox" name="days" value={i + 1} defaultChecked={workHours.days.includes(i + 1)} className="accent-wine" />
                {d}
              </label>
            ))}
            <input name="from" type="time" defaultValue={workHours.from} className="input h-9 w-28 text-sm" aria-label="С" />
            <span className="text-muted">—</span>
            <input name="to" type="time" defaultValue={workHours.to} className="input h-9 w-28 text-sm" aria-label="До" />
          </div>
          <p className="mt-1 text-xs text-muted">Вне рабочего времени заявки не распределяются (утром их берёт первый на смене), норматив ответа не идёт, можно включить автоответ в «Автоматизациях».</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Норматив ответа, рабочих минут</span>
            <input name="slaMinutes" type="number" min={1} max={1440} defaultValue={slaMinutes} className="input h-10 text-sm" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Сделка с сайта заводится, когда клиент…</span>
            <select name="autoDealFrom" defaultValue={autoDealFrom} className="input h-10 text-sm">
              <option value="off">не заводить (только заказы)</option>
              <option value="registered">зарегистрировался</option>
              <option value="book_started">начал книгу</option>
              <option value="book_half">ответил на половину вопросов</option>
              <option value="book_ready">почти закончил (25+ ответов)</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Макс. скидка менеджера из чата, %</span>
            <input name="maxDiscount" type="number" min={0} max={50} defaultValue={maxDiscount} className="input h-10 text-sm" />
          </label>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="unsorted" defaultChecked={unsorted} className="mt-0.5 size-4 accent-wine" />
          <span>
            «Неразобранное»: заявки с новых номеров (чат, звонок) сначала ждут, пока менеджер их примет или отклонит как спам
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="widgetEnabled" defaultChecked={widget.enabled} className="mt-0.5 size-4 accent-wine" />
          <span>Виджет на сайте: кнопки «Написать в WhatsApp» и «Перезвоните мне» (заявка с задачей позвонить за 15 минут)</span>
        </label>
        <label className="flex items-start gap-2 pl-6 text-sm">
          <input type="checkbox" name="widgetChat" defaultChecked={widget.chat} className="mt-0.5 size-4 accent-wine" />
          <span>Онлайн-чат в виджете — сообщения приходят в «Чаты», отвечать оттуда же</span>
        </label>
        <div className="flex items-center gap-3">
          <SubmitButton className="btn-sm">Сохранить</SubmitButton>
          <Result state={state} />
        </div>
      </form>
    </Section>
  );
}

export function Blocklist({ items }: { items: { value: string; label: string; date: string }[] }) {
  const [pending, start] = useTransition();
  return (
    <Section title="Спам">
      {items.length === 0 ? <p className="text-sm text-muted">Номеров в спаме нет. Отметить заявку как спам можно в «Неразобранном».</p> : null}
      <div className="divide-y divide-line">
        {items.map((i) => (
          <div key={i.value} className="flex items-center gap-3 py-2 text-sm">
            <span className="flex-1 tabular-nums">{i.label}</span>
            <span className="text-xs text-muted">{i.date}</span>
            <button className="text-xs text-wine hover:underline" disabled={pending} onClick={() => start(() => unblockAction(i.value))}>
              Убрать из спама
            </button>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function TemplateEditor({ template }: { template: { id: string; title: string; text: string } | null }) {
  const [state, action] = useActionState<SettingsState, FormData>(saveTemplateAction, {});
  const [pending, start] = useTransition();
  return (
    <form action={action} className={cn("space-y-2 rounded-xl border p-3", template ? "border-line" : "border-dashed border-line")}>
      {template ? <input type="hidden" name="id" value={template.id} /> : null}
      <div className="flex gap-2">
        <input name="title" defaultValue={template?.title} placeholder="Название, например «Сроки»" required maxLength={60} className="input h-9 flex-1 text-sm font-medium" />
        {template ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm h-9 text-red-700"
            disabled={pending}
            onClick={async () => (await ask(`Удалить шаблон «${template.title}»?`, true)) && start(() => deleteTemplateAction(template.id))}
            aria-label="Удалить шаблон"
          >
            <Trash2 className="size-4" />
          </button>
        ) : null}
      </div>
      <textarea name="text" defaultValue={template?.text} placeholder="Здравствуйте, {имя}! …" required maxLength={2000} rows={3} className="w-full resize-y rounded-xl border border-line bg-[#fbf9f5] px-3 py-2 text-sm outline-none focus:border-wine/40" />
      <div className="flex items-center gap-3">
        <SubmitButton className="btn-sm">{template ? "Сохранить" : "Добавить шаблон"}</SubmitButton>
        <Result state={state} />
      </div>
    </form>
  );
}
