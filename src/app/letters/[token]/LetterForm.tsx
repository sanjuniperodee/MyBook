"use client";

import { useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { useMessages } from "@/i18n/client";
import { apiFetch } from "@/lib/client-api";

export function LetterForm({ token, recipient }: { token: string; recipient: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const t = useMessages().gift.letter;

  if (state === "sent") {
    return (
      <div className="animate-[toast-in_300ms_var(--ease-out-soft)_both] py-6 text-center" role="status">
        <div className="mx-auto grid size-14 place-items-center rounded-[10px] bg-rose text-wine">
          <Check className="size-7" aria-hidden />
        </div>
        <h2 className="mt-5 font-serif text-4xl font-medium">{t.thanks}</h2>
        <p className="mx-auto mt-3 max-w-md text-ink-soft">{t.sent(recipient)}</p>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setState("sending");
        setError(null);
        try {
          await apiFetch(`/api/letters/${token}`, { method: "POST", json: Object.fromEntries(form) });
          setState("sent");
        } catch (err) {
          setError((err as Error).message || t.failed);
          setState("idle");
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="authorName">{t.name}</label>
          <input className="input" id="authorName" name="authorName" required maxLength={80} placeholder={t.namePlaceholder} />
        </div>
        <div>
          <label className="label" htmlFor="relation">{t.relation}</label>
          <input className="input" id="relation" name="relation" maxLength={80} placeholder={t.relationPlaceholder} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="text">{t.body}</label>
        <textarea
          className="input font-[family-name:var(--font-ptserif)] text-[17px]"
          id="text"
          name="text"
          rows={9}
          required
          minLength={10}
          maxLength={8000}
          placeholder={t.bodyPlaceholder}
        />
      </div>
      {/* ловушка для ботов */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      {error ? <Alert>{error}</Alert> : null}
      <button className="btn btn-primary btn-lg w-full sm:w-auto" disabled={state === "sending"}>
        {state === "sending" ? <LoaderCircle className="size-5 animate-spin" /> : null} {t.submit}
      </button>
      <p className="text-xs text-muted">{t.privacy}</p>
    </form>
  );
}
