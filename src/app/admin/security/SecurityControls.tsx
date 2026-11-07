"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import {
  Copy,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { ask, toast, toastError } from "@/components/ui/overlays";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import {
  confirmTwoFactorAction,
  disableTwoFactorAction,
  newBackupCodesAction,
  resetStaffTwoFactorAction,
  saveSecurityAction,
  startTwoFactorAction,
} from "./actions";

function BackupCodes({ codes }: { codes: string[] }) {
  return (
    <div
      className="rounded-[10px] border border-success/30 bg-success-bg p-4"
      data-testid="backup-codes"
    >
      <p className="text-sm font-medium text-success">
        Резервные коды — сохраните их сейчас, больше они не покажутся:
      </p>
      <p className="mt-1 text-xs text-success">
        Каждый код срабатывает один раз. Пригодятся, если потеряете телефон.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-1.5 font-mono text-sm sm:grid-cols-5">
        {codes.map((c) => (
          <span
            key={c}
            className="rounded-md bg-white px-2 py-1 text-center text-ink"
          >
            {c}
          </span>
        ))}
      </div>
      <button
        type="button"
        className="btn btn-outline btn-sm mt-3"
        onClick={() =>
          navigator.clipboard
            .writeText(codes.join("\n"))
            .then(() => toast("Скопировано"))
        }
      >
        <Copy className="size-4" /> Скопировать
      </button>
    </div>
  );
}

const codeInput = "input h-10 w-36 text-center font-mono tracking-widest";

export function TwoFactorCard({
  enabled,
  since,
  backupLeft,
  canDisable,
}: {
  enabled: boolean;
  since: string | null;
  backupLeft: number;
  canDisable: boolean;
}) {
  const router = useRouter();
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(
    null,
  );
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
      <Panel
        title="Ваш двухфакторный вход"
        actions={
          <Badge tone="success" dot>
            включён
          </Badge>
        }
      >
        <div className="space-y-4">
          <BackupCodes codes={codes} />
          <button
            type="button"
            className="btn btn-dark btn-sm"
            onClick={() => (setCodes(null), router.refresh())}
          >
            Я сохранил коды
          </button>
        </div>
      </Panel>
    );

  if (enabled)
    return (
      <Panel
        title="Ваш двухфакторный вход"
        description={`Включён с ${since}. Осталось резервных кодов: ${backupLeft}`}
        actions={
          <Badge tone="success" dot>
            включён
          </Badge>
        }
      >
        <div className="space-y-3" data-testid="2fa-on">
          <div className="flex items-start gap-3 rounded-[10px] bg-success-bg p-3 text-sm text-success">
            <ShieldCheck
              className="mt-0.5 size-5 shrink-0"
              strokeWidth={1.8}
              aria-hidden
            />
            <span>
              При входе в CRM, кроме пароля, нужен код из приложения на
              телефоне.
            </span>
          </div>
          <label htmlFor="totp-current" className="label pt-1">
            Код из приложения или резервный код
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="totp-current"
              className={codeInput}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              inputMode="numeric"
              autoComplete="one-time-code"
            />
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
              <KeyRound className="size-4" strokeWidth={1.8} aria-hidden />{" "}
              Новые резервные коды
            </button>
            {canDisable ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm text-danger hover:bg-danger-bg hover:text-danger"
                disabled={pending || !code.trim()}
                onClick={() =>
                  run(async () => {
                    if (
                      !(await ask(
                        "Отключить двухфакторный вход? Для входа снова будет достаточно пароля.",
                        true,
                      ))
                    )
                      return;
                    const r = await disableTwoFactorAction(code);
                    if (!r.ok) return void toast(r.message, "error");
                    toast("2FA отключена");
                    setCode("");
                    router.refresh();
                  })
                }
              >
                <ShieldOff className="size-4" strokeWidth={1.8} aria-hidden />{" "}
                Отключить
              </button>
            ) : null}
          </div>
          <p className="hint">
            Код нужен, чтобы выпустить новые резервные коды или отключить 2FA.
          </p>
        </div>
      </Panel>
    );

  return (
    <Panel
      title="Ваш двухфакторный вход"
      description="Защищает CRM, даже если пароль утёк"
      actions={
        <Badge tone="warning" dot>
          выключен
        </Badge>
      }
    >
      <div className="space-y-4" data-testid="2fa-off">
        {!setup ? (
          <>
            <p className="text-sm text-ink-soft">
              Понадобится приложение-аутентификатор: Google Authenticator,
              Яндекс Ключ, 1Password, Microsoft Authenticator.
            </p>
            <button
              type="button"
              className="btn btn-dark btn-sm"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const r = await startTwoFactorAction();
                  if (!r.ok) return void toast(r.message, "error");
                  setSetup(r);
                })
              }
            >
              {pending ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
              ) : (
                <ShieldCheck className="size-4" strokeWidth={1.8} aria-hidden />
              )}{" "}
              Включить 2FA
            </button>
          </>
        ) : (
          <div className="grid gap-5 sm:grid-cols-[220px_1fr]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={setup.qr}
              alt="QR-код для приложения-аутентификатора"
              width={220}
              height={220}
              className="rounded-[10px] border border-line"
            />
            <div className="min-w-0 space-y-3 text-sm">
              <ol className="list-decimal space-y-1 pl-5 text-ink-soft">
                <li>Откройте приложение и отсканируйте QR-код.</li>
                <li>Не получается сканировать — введите ключ вручную.</li>
                <li>Введите 6-значный код, который покажет приложение.</li>
              </ol>
              <div>
                <div className="label">Ключ</div>
                <code
                  className="block rounded-lg bg-sunken px-2 py-1.5 font-mono text-xs break-all"
                  data-testid="totp-secret"
                >
                  {setup.secret}
                </code>
              </div>
              <label htmlFor="totp-confirm" className="label">
                Код из приложения
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="totp-confirm"
                  className={codeInput}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
                <button
                  type="button"
                  className="btn btn-dark btn-sm"
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
      </div>
    </Panel>
  );
}

export function IpAllowlistForm({
  require2fa,
  allowlist,
  currentIp,
  ownerHas2fa,
}: {
  require2fa: boolean;
  allowlist: string;
  currentIp: string;
  ownerHas2fa: boolean;
}) {
  const [state, action] = useActionState(saveSecurityAction, {});
  return (
    <Panel
      title="Правила для всей команды"
      description="Обязательная 2FA и вход только из разрешённых сетей"
    >
      <form action={action} className="space-y-5">
        <label className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-line p-3.5 text-sm transition-colors hover:border-line-strong has-[:checked]:border-wine/40 has-[:checked]:bg-rose/30">
          <input
            type="checkbox"
            name="require2fa"
            defaultChecked={require2fa}
            className="mt-0.5 size-4 shrink-0 accent-wine"
          />
          <span>
            <span className="font-medium">
              Двухфакторный вход обязателен для всех сотрудников
            </span>
            <span className="block text-xs text-muted">
              Кто ещё не настроил — при входе увидит только эту страницу, пока
              не включит 2FA.{!ownerHas2fa ? " Сначала включите 2FA себе." : ""}
            </span>
          </span>
        </label>
        <label className="block">
          <span className="label">Вход в CRM только с этих адресов</span>
          <textarea
            name="ipAllowlist"
            defaultValue={allowlist}
            rows={4}
            className="input py-2 font-mono text-sm"
            placeholder={
              "например:\n95.56.10.20        # офис\n2.132.0.0/16       # мобильный оператор"
            }
          />
          <span className="hint">
            По одному адресу или подсети (CIDR) в строке. Пусто — без
            ограничений. Ваш текущий адрес:{" "}
            <b className="font-mono">{currentIp}</b>. Клиентов и сайт это не
            затрагивает.
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <SubmitButton className="h-10 text-sm">
            Сохранить правила
          </SubmitButton>
          {state.error ? (
            <span role="alert" className="text-sm text-danger">
              {state.error}
            </span>
          ) : state.ok ? (
            <span role="status" className="text-sm text-success">
              {state.ok}
            </span>
          ) : null}
        </div>
      </form>
    </Panel>
  );
}

export function ResetStaffButton({
  userId,
  name,
}: {
  userId: string;
  name: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm text-xs text-danger hover:bg-danger-bg hover:text-danger"
      disabled={pending}
      onClick={() =>
        start(async () => {
          if (
            !(await ask(
              `Сбросить 2FA сотруднику ${name}? Он войдёт по паролю и настроит её заново.`,
              true,
            ))
          )
            return;
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
