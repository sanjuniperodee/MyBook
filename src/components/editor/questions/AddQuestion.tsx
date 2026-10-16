"use client";

import { useState } from "react";
import { useMessages } from "@/i18n/client";

/** Форма своего вопроса: встаёт после текущего в той же главе. */
export function AddQuestion({ onAdd, onCancel }: { onAdd: (prompt: string) => Promise<void>; onCancel: () => void }) {
  const t = useMessages().editor.add;
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          await onAdd(value.trim());
        } catch (e) {
          setErr((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="label">{t.label}</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input autoFocus className="input" value={value} onChange={(e) => setValue(e.target.value)} maxLength={200} minLength={3} required placeholder={t.placeholder} />
        <button className="btn btn-primary shrink-0" disabled={busy}>
          {t.submit}
        </button>
        <button type="button" className="btn btn-ghost shrink-0" onClick={onCancel}>
          {t.cancel}
        </button>
      </div>
      {err ? <p className="mt-2 text-sm text-red-700">{err}</p> : null}
    </form>
  );
}
