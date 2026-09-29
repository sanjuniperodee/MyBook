"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { LettersArt } from "@/components/illustrations";

export function LetterForm({ token, recipient }: { token: string; recipient: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  if (state === "sent") {
    return (
      <div className="card animate-[toast-in_300ms_var(--ease-out-soft)_both] p-8 text-center">
        <LettersArt className="mx-auto h-36 w-auto" />
        <h2 className="mt-2 font-serif text-3xl">Спасибо!</h2>
        <p className="mt-2 text-muted">Ваше письмо отправлено автору книги. {recipient ? `${recipient} прочитает его на страницах книги.` : ""}</p>
      </div>
    );
  }

  return (
    <form
      className="card space-y-4 p-6 sm:p-8"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setState("sending");
        setError(null);
        try {
          const res = await fetch(`/api/letters/${token}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(Object.fromEntries(form)),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error ?? "Не удалось отправить письмо");
          setState("sent");
        } catch (err) {
          setError((err as Error).message);
          setState("idle");
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="authorName">Ваше имя</label>
          <input className="input" id="authorName" name="authorName" required maxLength={80} placeholder="Например, Дана" />
        </div>
        <div>
          <label className="label" htmlFor="relation">Кем вы приходитесь</label>
          <input className="input" id="relation" name="relation" maxLength={80} placeholder="подруга, брат, мама…" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="text">Ваше письмо</label>
        <textarea
          className="input font-[family-name:var(--font-ptserif)] text-[17px]"
          id="text"
          name="text"
          rows={9}
          required
          minLength={10}
          maxLength={8000}
          placeholder="Тёплые слова, общее воспоминание, пожелание…"
        />
      </div>
      {/* ловушка для ботов */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      {error ? <Alert>{error}</Alert> : null}
      <button className="btn btn-primary btn-lg w-full sm:w-auto" disabled={state === "sending"}>
        {state === "sending" ? <LoaderCircle className="size-5 animate-spin" /> : null} Отправить письмо
      </button>
      <p className="text-xs text-muted">Письмо увидит только автор книги и решит, добавить ли его в книгу.</p>
    </form>
  );
}
