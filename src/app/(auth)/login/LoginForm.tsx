"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type FormState } from "../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState<FormState, FormData>(loginAction, {});
  return (
    <form action={action} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {state.error ? <Alert>{state.error}</Alert> : null}
      <div>
        <label className="label" htmlFor="email">E-mail</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label className="label" htmlFor="password">Пароль</label>
          <Link href="/forgot" className="mb-1.5 text-sm text-wine hover:underline">Забыли пароль?</Link>
        </div>
        <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <SubmitButton className="btn-lg w-full" pendingText="Входим…">Войти</SubmitButton>
    </form>
  );
}
