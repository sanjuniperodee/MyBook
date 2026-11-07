"use client";

import { useState, useTransition } from "react";
import { KeyRound, LoaderCircle } from "lucide-react";
import { issueClientAccessAction } from "../new/actions";
import { ask } from "@/components/ui/overlays";
import { AccessCard } from "../new/NewClientForm";

/** Доступ клиента в личный кабинет: логин и кнопка «Выдать новый пароль» (показывается один раз, готовое сообщение клиенту). */
export function ClientAccess({ clientId, loginText }: { clientId: string; loginText: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ login: string; password: string; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <div className="text-sm">
        <span className="text-muted">Логин:</span> <code className="rounded bg-sunken px-1.5 py-0.5 font-mono text-[13px] select-all">{loginText}</code>
      </div>
      <button
        type="button"
        className="btn btn-outline btn-sm w-full"
        disabled={pending}
        onClick={async () => {
          if (!(await ask("Выдать клиенту новый пароль? Старый перестанет работать, а клиент выйдет из кабинета на всех устройствах."))) return;
          setError(null);
          start(async () => {
            const r = await issueClientAccessAction(clientId);
            if (r.error || !r.password || !r.loginText || !r.message) setError(r.error ?? "Не получилось выдать пароль");
            else setResult({ login: r.loginText, password: r.password, message: r.message });
          });
        }}
      >
        {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <KeyRound className="size-4" aria-hidden />} Выдать новый пароль
      </button>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {result ? <AccessCard title="Новый доступ" login={result.login} password={result.password} message={result.message} /> : null}
    </div>
  );
}
