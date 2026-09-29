"use client";

import Link from "next/link";
import { useActionState } from "react";
import { registerAction, type FormState } from "../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";

export function RegisterForm({ theme }: { theme?: string }) {
  const [state, action] = useActionState<FormState, FormData>(registerAction, {});
  return (
    <form action={action} className="space-y-4">
      {theme ? <input type="hidden" name="theme" value={theme} /> : null}
      {state.error ? <Alert>{state.error}</Alert> : null}
      <div>
        <label className="label" htmlFor="name">Ваше имя</label>
        <input className="input" id="name" name="name" autoComplete="given-name" required maxLength={100} />
      </div>
      <div>
        <label className="label" htmlFor="email">E-mail</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <label className="label" htmlFor="password">Пароль</label>
        <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        <p className="mt-1.5 text-xs text-muted">Минимум 8 символов</p>
      </div>
      <label className="flex items-start gap-2.5 text-sm text-muted">
        <input type="checkbox" name="consent" required className="mt-0.5 size-4 accent-wine" />
        <span>
          Я принимаю <Link href="/offer" target="_blank" className="text-wine underline underline-offset-2">условия оферты</Link> и{" "}
          <Link href="/privacy" target="_blank" className="text-wine underline underline-offset-2">политику конфиденциальности</Link>
        </span>
      </label>
      <SubmitButton className="btn-lg w-full" pendingText="Создаём аккаунт…">Создать аккаунт</SubmitButton>
    </form>
  );
}
