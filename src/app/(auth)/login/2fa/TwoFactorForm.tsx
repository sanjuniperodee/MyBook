"use client";

import { useMessages } from "@/i18n/client";
import { useActionState } from "react";
import { twoFactorAction, type FormState } from "../../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";

export function TwoFactorForm({ next }: { next?: string }) {
  const [state, action] = useActionState<FormState, FormData>(twoFactorAction, {});
  const t = useMessages().auth.twoFactor;
  return (
    <form action={action} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {state.error ? <Alert>{state.error}</Alert> : null}
      <div>
        <label className="label" htmlFor="code">{t.code}</label>
        <input className="input text-center font-mono text-2xl tracking-[0.3em]" id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 -]{6,9}" maxLength={9} autoFocus required />
      </div>
      <SubmitButton className="btn-lg w-full" pendingText={t.pending}>{t.submit}</SubmitButton>
    </form>
  );
}
