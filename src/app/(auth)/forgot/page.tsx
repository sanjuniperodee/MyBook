"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotAction, type FormState } from "../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";

export default function ForgotPage() {
  const [state, action] = useActionState<FormState, FormData>(forgotAction, {});
  return (
    <>
      <h1 className="font-serif text-4xl font-medium">Забыли пароль?</h1>
      <p className="mt-2 mb-8 text-muted">Укажите e-mail — пришлём ссылку для восстановления.</p>
      {state.ok ? (
        <Alert kind="success">{state.message}</Alert>
      ) : (
        <form action={action} className="space-y-4">
          {state.error ? <Alert>{state.error}</Alert> : null}
          <div>
            <label className="label" htmlFor="email">E-mail</label>
            <input className="input" id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <SubmitButton className="btn-lg w-full">Отправить ссылку</SubmitButton>
        </form>
      )}
      <p className="mt-8 text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-wine hover:underline">Вернуться ко входу</Link>
      </p>
    </>
  );
}
