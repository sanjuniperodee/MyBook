"use client";

import { useState } from "react";
import { Check, Copy, EyeOff, Link2, MessageCircle, Pencil, RefreshCw, Trash2, Undo2 } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { Alert } from "@/components/ui/Alert";
import { cn, formatDate } from "@/lib/utils";

export interface ManagedLetter {
  id: string;
  authorName: string;
  relation: string;
  text: string;
  status: "pending" | "approved" | "hidden";
  createdAt: string;
}

const tabs = [
  { id: "pending", label: "Новые" },
  { id: "approved", label: "В книге" },
  { id: "hidden", label: "Скрытые" },
] as const;

export function LettersManager({
  bookId,
  initialToken,
  initialLetters,
  appUrl,
  recipient,
  editable,
}: {
  bookId: string;
  initialToken: string | null;
  initialLetters: ManagedLetter[];
  appUrl: string;
  recipient: string;
  editable: boolean;
}) {
  const [token, setToken] = useState(initialToken);
  const [letters, setLetters] = useState(initialLetters);
  const [tab, setTab] = useState<ManagedLetter["status"]>(initialLetters.some((l) => l.status === "pending") ? "pending" : "approved");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const link = token ? `${appUrl}/letters/${token}` : "";
  const shareText = `Я готовлю книгу-сюрприз${recipient ? ` — её получит ${recipient}` : ""}. Напишите, пожалуйста, пару тёплых слов — они войдут в книгу: ${link}`;

  const setInvite = async (enabled: boolean, regenerate = false) => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ token: string | null }>(`/api/books/${bookId}/letters/invite`, { method: "POST", json: { enabled, regenerate } });
      setToken(res.token);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const update = async (id: string, patch: Partial<ManagedLetter>) => {
    const prev = letters;
    setLetters((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    try {
      await apiFetch(`/api/books/${bookId}/letters/${id}`, { method: "PATCH", json: patch });
    } catch (e) {
      setLetters(prev);
      setError((e as Error).message);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Удалить письмо безвозвратно?")) return;
    const prev = letters;
    setLetters((ls) => ls.filter((l) => l.id !== id));
    try {
      await apiFetch(`/api/books/${bookId}/letters/${id}`, { method: "DELETE" });
    } catch (e) {
      setLetters(prev);
      setError((e as Error).message);
    }
  };

  const visible = letters.filter((l) => l.status === tab);

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <aside>
        <div className="card p-6 lg:sticky lg:top-24">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-rose text-wine">
            <Link2 className="size-5" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">Ссылка для близких</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            Отправьте ссылку друзьям и родным — они напишут письма без регистрации. Вы решаете, какие письма попадут в книгу: они соберутся в главу «Письма близких».
          </p>
          {error ? <Alert className="mt-4">{error}</Alert> : null}
          {token ? (
            <>
              <div className="mt-5 flex items-center gap-2 rounded-xl border border-line bg-cream/50 p-2 pl-3">
                <span className="min-w-0 flex-1 truncate text-sm">{link}</span>
                <button
                  className="btn btn-dark btn-sm shrink-0"
                  onClick={async () => {
                    await navigator.clipboard.writeText(link);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1800);
                  }}
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Скопировано" : "Копировать"}
                </button>
              </div>
              <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" className="btn btn-outline mt-3 w-full">
                <MessageCircle className="size-4" /> Отправить в WhatsApp
              </a>
              <div className="mt-4 flex justify-between text-xs">
                <button className="flex items-center gap-1 text-muted hover:text-ink" disabled={busy || !editable} onClick={() => confirm("Старая ссылка перестанет работать. Создать новую?") && setInvite(true, true)}>
                  <RefreshCw className="size-3.5" /> Новая ссылка
                </button>
                <button className="text-red-700 hover:underline" disabled={busy || !editable} onClick={() => setInvite(false)}>
                  Закрыть приём писем
                </button>
              </div>
              <p className="mt-4 text-xs text-muted">По ссылке видны название книги, ваше имя и имя получателя.</p>
            </>
          ) : (
            <button className="btn btn-primary mt-5 w-full" onClick={() => setInvite(true)} disabled={busy || !editable}>
              Создать ссылку-приглашение
            </button>
          )}
        </div>
      </aside>

      <section>
        <div className="flex gap-1.5">
          {tabs.map((t) => {
            const n = letters.filter((l) => l.status === t.id).length;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className={cn("rounded-full px-4 py-2 text-sm", tab === t.id ? "bg-ink text-white" : "bg-white text-ink-soft hover:bg-cream")}>
                {t.label} <span className="opacity-60">{n}</span>
              </button>
            );
          })}
        </div>
        {visible.length === 0 ? (
          <div className="mt-6 rounded-3xl border-2 border-dashed border-line px-6 py-16 text-center text-muted">
            {tab === "pending" ? (token ? "Новых писем пока нет. Поделитесь ссылкой с близкими." : "Создайте ссылку и отправьте её близким.") : "Здесь пока пусто."}
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {visible.map((l) => (
              <article key={l.id} className="card p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="font-semibold">
                    {l.authorName}
                    {l.relation ? <span className="font-normal text-muted">, {l.relation}</span> : null}
                  </div>
                  <div className="text-xs text-muted">{formatDate(l.createdAt, true)}</div>
                </div>
                {editing === l.id ? (
                  <LetterEditor letter={l} onCancel={() => setEditing(null)} onSave={async (patch) => { await update(l.id, patch); setEditing(null); }} />
                ) : (
                  <p className="mt-3 font-[family-name:var(--font-ptserif)] text-[16px] leading-relaxed whitespace-pre-line text-ink-soft">{l.text}</p>
                )}
                {editable && editing !== l.id ? (
                  <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
                    {l.status !== "approved" ? (
                      <button className="btn btn-primary btn-sm" onClick={() => update(l.id, { status: "approved" })}>
                        <Check className="size-4" /> Добавить в книгу
                      </button>
                    ) : (
                      <button className="btn btn-outline btn-sm" onClick={() => update(l.id, { status: "pending" })}>
                        <Undo2 className="size-4" /> Убрать из книги
                      </button>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(l.id)}>
                      <Pencil className="size-4" /> Исправить
                    </button>
                    {l.status !== "hidden" ? (
                      <button className="btn btn-ghost btn-sm" onClick={() => update(l.id, { status: "hidden" })}>
                        <EyeOff className="size-4" /> Скрыть
                      </button>
                    ) : null}
                    <button className="btn btn-ghost btn-sm ml-auto text-red-700" onClick={() => remove(l.id)}>
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function LetterEditor({ letter, onSave, onCancel }: { letter: ManagedLetter; onSave: (p: Partial<ManagedLetter>) => Promise<void>; onCancel: () => void }) {
  const [authorName, setAuthorName] = useState(letter.authorName);
  const [relation, setRelation] = useState(letter.relation);
  const [text, setText] = useState(letter.text);
  return (
    <div className="mt-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <input className="input h-10" value={authorName} onChange={(e) => setAuthorName(e.target.value)} maxLength={80} />
        <input className="input h-10" value={relation} onChange={(e) => setRelation(e.target.value)} maxLength={80} placeholder="кем приходится" />
      </div>
      <textarea className="input" rows={8} value={text} onChange={(e) => setText(e.target.value)} maxLength={8000} />
      <div className="flex gap-2">
        <button className="btn btn-primary btn-sm" onClick={() => onSave({ authorName: authorName.trim(), relation: relation.trim(), text: text.trim() })} disabled={!authorName.trim() || !text.trim()}>
          Сохранить
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Отмена</button>
      </div>
    </div>
  );
}
