"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Copy, KeyRound, LoaderCircle, ShieldCheck, ShieldOff } from "lucide-react";
import { ask, toast, toastError } from "@/components/ui/overlays";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { confirmTwoFactorAction, disableTwoFactorAction, newBackupCodesAction, resetStaffTwoFactorAction, saveSecurityAction, startTwoFactorAction } from "./actions";

function BackupCodes({ codes }: { codes: string[] }) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4" data-testid="backup-codes">
      <p className="text-sm font-medium text-emerald-900">Резервные коды — сохраните их сейчас, больше они не покажутся:</p>
      <p className="mt-1 text-xs text-emerald-800">Каждый код срабатывает один раз. Пригодятся, если потеряете телефон.</p>
      <div className="mt-3 grid grid-cols-2 gap-1.5 font-mono text-sm sm:grid-cols-5">
        {codes.map((c) => (
          <span key={c} className="rounded bg-white px-2 py-1 text-center">
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

const codeInput = "input h-10 w-36 text-center font-mono tracking-widest";

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
      <section className="space-y-3 rounded-2xl border border-line bg-white p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="size-5 text-emerald-600" /> Двухфакторный вход включён
        </h2>
        <BackupCodes codes={codes} />
        <button type="button" className="btn btn-sm" onClick={() => (setCodes(null), router.refresh())}>
          Я сохранил коды
        </button>
      </section>
    );

  if (enabled)
    return (
      <section className="space-y-4 rounded-2xl border border-line bg-white p-5" data-testid="2fa-on">
        <h2 className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="size-5 text-emerald-600" /> Двухфакторный вход включён
        </h2>
        <p className="text-sm text-muted">
          С {since}. Осталось резервных кодов: {backupLeft}.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input className={codeInput} value={code} onChange={(e) => setCode(e.target.value)} placeholder="код" inputMode="numeric" aria-label="Код из приложения" />
          <button
            type="button"
            className="btn btn-outline btn-sm"
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
            <KeyRound className="size-4" /> Новые резервные коды
          </button>
          {canDisable ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm text-red-700"
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
              <ShieldOff className="size-4" /> Отключить
            </button>
          ) : null}
        </div>
        <p className="text-xs text-muted">Для этих действий введите текущий код из приложения или резервный код.</p>
      </section>
    );

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-white p-5" data-testid="2fa-off">
      <h2 className="flex items-center gap-2 font-semibold">
        <ShieldOff className="size-5 text-muted" /> Двухфакторный вход выключен
      </h2>
      {!setup ? (
        <>
          <p className="text-sm text-ink-soft">Понадобится приложение-аутентификатор: Google Authenticator, Яндекс Ключ, 1Password, Microsoft Authenticator.</p>
          <button
            type="button"
            className="btn btn-sm"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const r = await startTwoFactorAction();
                if (!r.ok) return void toast(r.message, "error");
                setSetup(r);
              })
            }
          >
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} Включить 2FA
          </button>
        </>
      ) : (
        <div className="grid gap-5 sm:grid-cols-[220px_1fr]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qr} alt="QR-код для приложения-аутентификатора" width={220} height={220} className="rounded-xl border border-line" />
          <div className="space-y-3 text-sm">
            <ol className="list-decimal space-y-1 pl-5 text-ink-soft">
              <li>Откройте приложение и отсканируйте QR-код.</li>
              <li>Не получается сканировать — введите ключ вручную.</li>
              <li>Введите 6-значный код, который покажет приложение.</li>
            </ol>
            <div>
              <div className="text-xs text-muted">Ключ</div>
              <code className="block rounded-lg bg-cream px-2 py-1.5 font-mono text-xs break-all" data-testid="totp-secret">
                {setup.secret}
              </code>
            </div>
            <div className="flex items-center gap-2">
              <input className={codeInput} value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" inputMode="numeric" autoComplete="one-time-code" aria-label="Код подтверждения" />
              <button
                type="button"
                className="btn btn-sm"
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
          </div>
        </div>
      )}
    </section>
  );
}

export function IpAllowlistForm({ require2fa, allowlist, currentIp, ownerHas2fa }: { require2fa: boolean; allowlist: string; currentIp: string; ownerHas2fa: boolean }) {
  const [state, action] = useActionState(saveSecurityAction, {});
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <h2 className="mb-3 font-semibold">Правила для всей команды</h2>
      <form action={action} className="space-y-4">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="require2fa" defaultChecked={require2fa} className="mt-0.5 accent-wine" />
          <span>
            Двухфакторный вход обязателен для всех сотрудников
            <span className="block text-xs text-muted">Кто ещё не настроил — при входе увидит только эту страницу, пока не включит 2FA.{!ownerHas2fa ? " Сначала включите 2FA себе." : ""}</span>
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm">Вход в CRM только с этих адресов</span>
          <textarea name="ipAllowlist" defaultValue={allowlist} rows={4} className="input py-2 font-mono text-sm" placeholder={"например:\n95.56.10.20        # офис\n2.132.0.0/16       # мобильный оператор"} aria-label="Разрешённые IP" />
          <span className="mt-1 block text-xs text-muted">
            По одному адресу или подсети (CIDR) в строке. Пусто — без ограничений. Ваш текущий адрес: <b className="font-mono">{currentIp}</b>. Клиентов и сайт это не затрагивает.
          </span>
        </label>
        <div className="flex items-center gap-3">
          <SubmitButton className="btn-sm">Сохранить</SubmitButton>
          {state.error ? <span className="text-xs text-red-700">{state.error}</span> : state.ok ? <span className="text-xs text-emerald-700">{state.ok}</span> : null}
        </div>
      </form>
    </section>
  );
}

export function ResetStaffButton({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="ml-auto text-xs text-red-700 hover:underline disabled:opacity-50"
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
