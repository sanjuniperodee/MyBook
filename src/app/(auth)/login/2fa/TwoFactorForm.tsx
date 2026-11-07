"use client";

import { useMessages } from "@/i18n/client";
import { useActionState } from "react";
import { twoFactorAction, type FormState } from "../../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { Field } from "@/components/ui/Field";

export function TwoFactorForm({ next }: { next?: string }) {
  const [state, action] = useActionState<FormState, FormData>(twoFactorAction, {});
  const t = useMessages().auth.twoFactor;
  return (
    <form action={action} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {state.error && state.field !== "code" ? <Alert>{state.error}</Alert> : null}
      <Field label={t.code} error={state.field === "code" ? state.error : undefined}>
        <input className="input h-14 text-center text-2xl font-medium tracking-[0.3em] tabular-nums" id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 -]{6,9}" maxLength={9} autoFocus required />
      </Field>
      <SubmitButton className="btn-lg w-full" pendingText={t.pending}>{t.submit}</SubmitButton>
    </form>
  );
}
