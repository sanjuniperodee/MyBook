"use client";

import { confirmDialog } from "@/components/ui/overlays";
import { EmptyState } from "@/components/ui/EmptyState";
import { useState } from "react";
import { Check, Copy, EyeOff, Link2, Mail, MessageCircle, Pencil, RefreshCw, Trash2, Undo2 } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { Alert } from "@/components/ui/Alert";
import { formatDate } from "@/lib/dates";
import { useLocale, useMessages } from "@/i18n/client";
import { localizePath, type Locale } from "@/i18n/config";
import { letterShareFor } from "@/i18n/messages/partial";
import type { BookKind } from "@/lib/content/kinds";
import { INVITE_TEXT_MAX, inviteRecipient } from "@/lib/content/letter-invite";
import { useAutosave } from "@/hooks/useAutosave";
import { SaveIndicator } from "@/components/SaveIndicator";

interface ManagedLetter {
  id: string;
  authorName: string;
  relation: string;
  text: string;
  status: "pending" | "approved" | "hidden";
  createdAt: string;
}

const tabs = ["pending", "approved", "hidden"] as const;

export function LettersManager({
  bookId,
  initialToken,
  initialLetters,
  appUrl,
  invitation,
  bookLanguage,
  editable,
}: {
  bookId: string;
  initialToken: string | null;
  initialLetters: ManagedLetter[];
  appUrl: string;
  /** О какой книге просим письма: вид, автор, название, получатель (у автобиографии его нет), свой текст приглашения. */
  invitation: { kind: BookKind; author: string; title: string; recipient: string; inviteText: string };
  bookLanguage: Locale;
  editable: boolean;
}) {
  const msgs = useMessages();
  const t = msgs.books.letters;
  const locale = useLocale();
  const [token, setToken] = useState(initialToken);
  const [letters, setLetters] = useState(initialLetters);
  const [tab, setTab] = useState<ManagedLetter["status"]>(initialLetters.some((l) => l.status === "pending") ? "pending" : "approved");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  // Близкие пишут для книги — страница письма и текст приглашения на языке книги.
  const link = token ? `${appUrl}${localizePath(`/letters/${token}`, bookLanguage)}` : "";
  // Свой текст приглашения: близкие видят его на странице письма и в сообщении со ссылкой вместо текста по умолчанию.
  const [inviteText, setInviteText] = useState(invitation.inviteText);
  const shareText = letterShareFor(bookLanguage)({ ...invitation, inviteText }, link);
  const lt = msgs.gift.letter;
  const defaultInvite = invitation.kind === "gift" ? lt.text(invitation.recipient.trim(), invitation.title) : lt.textByKind[invitation.kind](invitation.title);
  const inviteSave = useAutosave<string>(async (text) => {
    await apiFetch(`/api/books/${bookId}`, { method: "PATCH", json: { inviteText: text } });
  }, 700);

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
    if (!(await confirmDialog({ title: t.deleteTitle, text: t.deleteText, confirmLabel: msgs.common.actions.delete, danger: true }))) return;
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
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:gap-10">
      <aside>
        <div className="rounded-[14px] border border-line bg-white p-5 sm:p-6 lg:sticky lg:top-24">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Link2 className="size-5 text-wine" aria-hidden /> {t.linkTitle}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            {t.linkText}
          </p>
          {error ? <Alert className="mt-4">{error}</Alert> : null}
          {token ? (
            <>
              <div className="mt-5 flex items-center gap-2 rounded-[10px] border border-line bg-sunken p-1.5 pl-3">
                <span className="min-w-0 flex-1 truncate text-sm" title={link}>{link}</span>
                <button
                  className="btn btn-dark btn-sm shrink-0"
                  onClick={async () => {
                    await navigator.clipboard.writeText(link);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1800);
                  }}
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? t.copied : t.copy}
                </button>
              </div>
              <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" className="btn btn-outline mt-3 w-full">
                <MessageCircle className="size-4" /> {t.whatsapp}
              </a>
              <div className="mt-3 flex flex-wrap justify-between gap-x-3 text-xs">
                <button className="flex min-h-11 items-center gap-1 text-muted hover:text-ink" disabled={busy || !editable} onClick={async () => (await confirmDialog({ title: t.regenTitle, text: t.regenText, confirmLabel: t.regenConfirm })) && setInvite(true, true)}>
                  <RefreshCw className="size-3.5" /> {t.regen}
                </button>
                <button className="min-h-11 text-danger hover:underline" disabled={busy || !editable} onClick={() => setInvite(false)}>
                  {t.close}
                </button>
              </div>
              <div className="mt-5">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="invite-text" className="text-sm font-medium">
                    {t.inviteText}
                  </label>
                  <SaveIndicator status={inviteSave.status} error={inviteSave.error} className="text-xs" />
                </div>
                <textarea
                  id="invite-text"
                  className="input mt-1.5 text-sm"
                  rows={4}
                  maxLength={INVITE_TEXT_MAX}
                  value={inviteText}
                  placeholder={defaultInvite}
                  disabled={!editable}
                  onChange={(e) => {
                    setInviteText(e.target.value);
                    inviteSave.schedule(e.target.value);
                  }}
                />
                <p className="mt-1 text-xs text-muted">{t.inviteTextHint}</p>
              </div>
              <p className="mt-4 text-xs text-muted">{t.privacy(!!inviteRecipient(invitation.kind, invitation.recipient, inviteText))}</p>
            </>
          ) : (
            <button className="btn btn-primary mt-5 w-full" onClick={() => setInvite(true)} disabled={busy || !editable}>
              {t.create}
            </button>
          )}
        </div>
      </aside>

      <section>
        <div className="flex gap-1.5">
          {tabs.map((id) => {
            const n = letters.filter((l) => l.status === id).length;
            return (
              <button key={id} onClick={() => setTab(id)} aria-pressed={tab === id} className="chip min-h-11 sm:min-h-9">
                {t.tabs[id]} <span className="opacity-60">{n}</span>
              </button>
            );
          })}
        </div>
        {visible.length === 0 ? (
          <div className="mt-6 rounded-[14px] border border-dashed border-line-strong bg-white/50">
            <EmptyState icon={Mail} title={t.empty[tab]}>
              {tab === "pending" ? (token ? t.emptyText.pendingInvited : t.emptyText.pending) : t.emptyText[tab]}
            </EmptyState>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {visible.map((l) => (
              <article key={l.id} className="rounded-[14px] border border-line bg-white p-5 sm:p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="font-semibold">
                    {l.authorName}
                    {l.relation ? <span className="font-normal text-muted">, {l.relation}</span> : null}
                  </div>
                  <div className="text-xs text-muted">{formatDate(l.createdAt, true, locale)}</div>
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
                        <Check className="size-4" /> {t.approve}
                      </button>
                    ) : (
                      <button className="btn btn-outline btn-sm" onClick={() => update(l.id, { status: "pending" })}>
                        <Undo2 className="size-4" /> {t.unapprove}
                      </button>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(l.id)}>
                      <Pencil className="size-4" /> {t.edit}
                    </button>
                    {l.status !== "hidden" ? (
                      <button className="btn btn-ghost btn-sm" onClick={() => update(l.id, { status: "hidden" })}>
                        <EyeOff className="size-4" /> {t.hide}
                      </button>
                    ) : null}
                    <button className="btn btn-ghost btn-icon btn-sm ml-auto text-danger hover:bg-danger-bg hover:text-danger" aria-label={msgs.common.actions.delete} onClick={() => remove(l.id)}>
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
  const t = useMessages().books.letters;
  const [authorName, setAuthorName] = useState(letter.authorName);
  const [relation, setRelation] = useState(letter.relation);
  const [text, setText] = useState(letter.text);
  return (
    <div className="mt-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <input className="input h-10" value={authorName} onChange={(e) => setAuthorName(e.target.value)} maxLength={80} />
        <input className="input h-10" value={relation} onChange={(e) => setRelation(e.target.value)} maxLength={80} placeholder={t.relation} />
      </div>
      <textarea className="input" rows={8} value={text} onChange={(e) => setText(e.target.value)} maxLength={8000} />
      <div className="flex gap-2">
        <button className="btn btn-primary btn-sm" onClick={() => onSave({ authorName: authorName.trim(), relation: relation.trim(), text: text.trim() })} disabled={!authorName.trim() || !text.trim()}>
          {t.save}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>{t.cancel}</button>
      </div>
    </div>
  );
}
