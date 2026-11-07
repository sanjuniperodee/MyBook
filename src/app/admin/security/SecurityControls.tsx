"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Copy, KeyRound, LoaderCircle, ShieldCheck, ShieldOff } from "lucide-react";
import { ask, toast, toastError } from "@/components/ui/overlays";
import { Facts } from "@/components/ui/Facts";
import { cn } from "@/lib/class-names";
import { Actions, Field, Group, Note, Result, SaveButton, Section, Toggle } from "../settings/ui";
import { confirmTwoFactorAction, disableTwoFactorAction, newBackupCodesAction, resetStaffTwoFactorAction, saveSecurityAction, startTwoFactorAction } from "./actions";

function BackupCodes({ codes }: { codes: string[] }) {
  return (
    <div className="rounded-[var(--r-ctl)] border border-success/30 bg-success-bg p-4" data-testid="backup-codes">
      <p className="text-sm font-medium text-success">Резервные коды — сохраните их сейчас, больше они не покажутся:</p>
      <p className="mt-1 text-xs text-success">Каждый код срабатывает один раз. Пригодятся, если потеряете телефон.</p>
      <div className="mt-3 grid grid-cols-2 gap-1.5 font-mono text-sm sm:grid-cols-5">
        {codes.map((c) => (
          <span key={c} className="rounded-md bg-white px-2 py-1 text-center text-ink">
            {c}
          </span>
        ))}
      </div>
      <button type="button" className="btn btn-outline btn-sm mt-3" onClick={() => navigator.clipboard.writeText(codes.join("\n")).then(() => toast("Скопировано"))}>
        <Copy className="size-4" /> Скопировать
      </button>
    </div>
  );
}

/** Шаг инструкции: номер слева, заголовок и содержимое справа. */
function Step({ n, title, children, done }: { n: number; title: string; children?: React.ReactNode; done?: boolean }) {
  return (
    <li className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3">
      <span className={cn("grid size-7 place-items-center rounded-full text-xs font-semibold tabular-nums", done ? "bg-success text-white" : "bg-sunken text-ink-soft")} aria-hidden>
        {n}
      </span>
      <div className="min-w-0 pb-1">
        <div className="pt-1 text-sm font-medium">{title}</div>
        {children ? <div className="mt-2 space-y-3">{children}</div> : null}
      </div>
    </li>
  );
}

export function TwoFactorCard({ enabled, since, backupLeft, canDisable }: { enabled: boolean; since: string | null; backupLeft: number; canDisable: boolean }) {
  const router = useRouter();
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      try {
        await fn();
      } catch (err) {
        toastError(err);
      }
    });

  if (codes)
    return (
      <Section id="my-2fa" title="Ваш двухфакторный вход" description="Сохраните резервные коды" status={{ tone: "ok", label: "включён" }}>
        <div className="max-w-[40rem] space-y-4">
          <BackupCodes codes={codes} />
          <button type="button" className="btn btn-dark" onClick={() => (setCodes(null), router.refresh())}>
            Я сохранил коды
          </button>
        </div>
      </Section>
    );

  if (enabled)
    return (
      <Section id="my-2fa" title="Ваш двухфакторный вход" description="При входе в CRM, кроме пароля, нужен код из приложения на телефоне" status={{ tone: "ok", label: `включён с ${since}` }}>
        <div className="max-w-[40rem] space-y-5" data-testid="2fa-on">
          <Facts
            items={[
              { label: "Состояние", value: "включён" },
              { label: "Резервные коды", value: `осталось ${backupLeft}` },
            ]}
          />
          <Group title="Действия" hint="Код из приложения или резервный код нужен, чтобы выпустить новые резервные коды или отключить 2FA.">
            <Field label="Код из приложения или резервный код">
              <input className="input w-44 text-center font-mono tracking-widest" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" inputMode="numeric" autoComplete="one-time-code" />
            </Field>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-outline"
                disabled={pending || !code.trim()}
                onClick={() =>
                  run(async () => {
                    const r = await newBackupCodesAction(code);
                    if (!r.ok) return void toast(r.message, "error");
                    setCode("");
                    setCodes(r.codes);
                  })
                }
              >
                <KeyRound className="size-4" strokeWidth={1.8} aria-hidden /> Новые резервные коды
              </button>
              {canDisable ? (
                <button
                  type="button"
                  className="btn btn-ghost text-danger hover:bg-danger-bg hover:text-danger"
                  disabled={pending || !code.trim()}
                  onClick={() =>
                    run(async () => {
                      if (!(await ask("Отключить двухфакторный вход? Для входа снова будет достаточно пароля.", true))) return;
                      const r = await disableTwoFactorAction(code);
                      if (!r.ok) return void toast(r.message, "error");
                      toast("2FA отключена");
                      setCode("");
                      router.refresh();
                    })
                  }
                >
                  <ShieldOff className="size-4" strokeWidth={1.8} aria-hidden /> Отключить 2FA
                </button>
              ) : null}
            </div>
          </Group>
        </div>
      </Section>
    );

  return (
    <Section id="my-2fa" title="Ваш двухфакторный вход" description="Защищает CRM, даже если пароль утёк: кроме пароля нужен код из приложения" status={{ tone: "warn", label: "выключен" }}>
      <div className="max-w-[40rem]" data-testid="2fa-off">
        <ol className="space-y-4">
          <Step n={1} title="Установите приложение-аутентификатор" done={!!setup}>
            <p className="text-sm text-muted">Google Authenticator, Яндекс Ключ, 1Password или Microsoft Authenticator.</p>
            {!setup ? (
              <button
                type="button"
                className="btn btn-dark"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    const r = await startTwoFactorAction();
                    if (!r.ok) return void toast(r.message, "error");
                    setSetup(r);
                  })
                }
              >
                {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <ShieldCheck className="size-4" strokeWidth={1.8} aria-hidden />} Включить 2FA
              </button>
            ) : null}
          </Step>
          {setup ? (
            <>
              <Step n={2} title="Отсканируйте QR-код">
                <div className="grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={setup.qr} alt="QR-код для приложения-аутентификатора" width={220} height={220} className="rounded-[var(--r-ctl)] border border-line" />
                  <div className="min-w-0 text-sm">
                    <div className="label">Не получается сканировать — введите ключ вручную</div>
                    <code className="block rounded-lg bg-sunken px-2 py-1.5 font-mono text-xs break-all" data-testid="totp-secret">
                      {setup.secret}
                    </code>
                  </div>
                </div>
              </Step>
              <Step n={3} title="Введите 6-значный код из приложения">
                <div className="flex flex-wrap items-center gap-2">
                  <input aria-label="Код из приложения" className="input w-44 text-center font-mono tracking-widest" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" inputMode="numeric" autoComplete="one-time-code" />
                  <button
                    type="button"
                    className="btn btn-dark"
                    disabled={pending || code.replace(/\D/g, "").length !== 6}
                    onClick={() =>
                      run(async () => {
                        const r = await confirmTwoFactorAction(code);
                        if (!r.ok) return void toast(r.message, "error");
                        setCode("");
                        setSetup(null);
                        setCodes(r.codes);
                      })
                    }
                  >
                    Подтвердить
                  </button>
                </div>
              </Step>
            </>
          ) : null}
        </ol>
      </div>
    </Section>
  );
}

export function IpAllowlistForm({ require2fa, allowlist, currentIp, ownerHas2fa }: { require2fa: boolean; allowlist: string; currentIp: string; ownerHas2fa: boolean }) {
  const [state, action] = useActionState(saveSecurityAction, {});
  const on = require2fa || !!allowlist.trim();
  return (
    <Section id="team-rules" title="Правила для всей команды" description="Обязательная 2FA и вход только из разрешённых сетей" status={on ? { tone: "ok", label: "правила включены" } : { tone: "off", label: "без ограничений" }}>
      <form action={action} className="space-y-5">
        <Group title="Двухфакторный вход" hint="Кто ещё не настроил, при входе увидит только страницу «Безопасность», пока не включит 2FA.">
          <Toggle name="require2fa" defaultChecked={require2fa} label="Двухфакторный вход обязателен для всех сотрудников" hint={!ownerHas2fa ? "Сначала включите 2FA себе." : undefined} />
        </Group>
        <Group title="Разрешённые сети" hint="Вход в CRM только с этих адресов. Клиентов и сайт это не затрагивает.">
          <Field
            label="Адреса и подсети"
            hint={
              <>
                По одному адресу или подсети (CIDR) в строке. Пусто — без ограничений. Ваш текущий адрес: <b className="font-mono">{currentIp}</b>.
              </>
            }
          >
            <textarea name="ipAllowlist" defaultValue={allowlist} rows={4} className="input font-mono" placeholder={"например:\n95.56.10.20        # офис\n2.132.0.0/16       # мобильный оператор"} />
          </Field>
        </Group>
        <Actions>
          <SaveButton>Сохранить правила</SaveButton>
          <Result state={state} />
        </Actions>
      </form>
    </Section>
  );
}

export function ResetStaffButton({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm text-danger hover:bg-danger-bg hover:text-danger"
      disabled={pending}
      onClick={() =>
        start(async () => {
          if (!(await ask(`Сбросить 2FA сотруднику ${name}? Он войдёт по паролю и настроит её заново.`, true))) return;
          const r = await resetStaffTwoFactorAction(userId);
          if (!r.ok) return void toast(r.message, "error");
          toast("2FA сброшена");
          router.refresh();
        })
      }
    >
      Сбросить 2FA
    </button>
  );
}

/** Подсказка про восстановление доступа, если потеряны все аккаунты руководителя. */
export function RecoveryNote() {
  return (
    <Note>
      Потеряли доступ ко всем аккаунтам руководителя? На сервере: <code className="rounded-md bg-sunken px-1">node scripts/crm-security-reset.mjs</code> — снимет ограничения по IP и обязательную 2FA, а с <code className="rounded-md bg-sunken px-1">--email адрес</code> ещё и сбросит 2FA этому сотруднику.
    </Note>
  );
}
