"use client";

import { useActionState } from "react";
import { useMessages } from "@/i18n/client";
import { resetAction, type FormState } from "../../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";

/** Форма нового пароля: сброс по почте или доступ в кабинет после оплаты (ссылка тратится только здесь, по POST). */
export function ResetForm({ token, whatsappUrl }: { token: string; whatsappUrl: string }) {
  const [state, action] = useActionState<FormState, FormData>(resetAction, {});
  const { reset: t, fields: f } = useMessages().auth;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {state.error ? (
        <Alert>
          {state.error}
          {state.expired ? (
            <>
              {" "}
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="font-medium underline">
                {t.writeUs}
              </a>
            </>
          ) : null}
        </Alert>
      ) : null}
      <div>
        <label className="label" htmlFor="password">
          {f.newPassword}
        </label>
        <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <SubmitButton className="btn-lg w-full">{t.submit}</SubmitButton>
    </form>
  );
}
