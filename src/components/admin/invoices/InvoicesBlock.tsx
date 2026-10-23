"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Ban, Copy, HandCoins, KeyRound, LoaderCircle, Search, Send, UserSearch } from "lucide-react";
import { cancelInvoiceAction, invoiceAccountsAction, resendInvoiceAccessAction, resendInvoiceAction, type AccessAccount } from "@/app/admin/invoices/actions";
import { formatPrice } from "@/config/site";
import { confirmDialog, toast, toastError } from "@/components/ui/overlays";
import { cn } from "@/lib/class-names";
import { copyText } from "./InvoiceDialog";
import { accessLabels, invoiceActions, invoiceStatus, purposeLabels, type InvoicePerms, type InvoiceView } from "./model";

const tones = { wait: "bg-amber-50 text-amber-900", ok: "bg-emerald-50 text-emerald-800", off: "bg-cream text-muted" } as const;

/**
 * Блок «Счета» (страница сделки и карточка сделки в чате): номер, сумма, назначение, статус, «клиент сообщил об оплате»,
 * доступ в кабинет; действия — по правам. «Оплата пришла» в сделке открывает форму приёма платежа (onPaid), в чате —
 * ведёт в сделку с выбранным счётом.
 */
export function InvoicesBlock({ dealId, invoices, perms, onPaid, compact = false }: { dealId: string; invoices: InvoiceView[]; perms: InvoicePerms; onPaid?: (invoice: InvoiceView) => void; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  if (!invoices.length) return null;

  const run = async (key: string, work: () => Promise<{ ok: boolean; message: string }>) => {
    setBusy(key);
    try {
      const r = await work();
      toast(r.message, r.ok ? "success" : "error");
      if (r.ok) router.refresh();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (v: InvoiceView) => {
    const ok = await confirmDialog({ title: `Отменить счёт ${v.label}?`, text: "Ссылка на оплату перестанет работать. Клиенту ничего не отправится — предупредите его в чате.", confirmLabel: "Отменить счёт", cancelLabel: "Не отменять", danger: true });
    if (ok) await run(`cancel:${v.id}`, () => cancelInvoiceAction(v.id));
  };

  return (
    <section className="space-y-2" data-testid="deal-invoices">
      <h3 className={cn("font-semibold", compact ? "text-xs tracking-wide text-muted uppercase" : "text-xs text-ink-soft")}>Счета</h3>
      <ul className="space-y-2">
        {invoices.map((v) => {
          const status = invoiceStatus(v);
          const can = invoiceActions(v, perms);
          const access = v.status === "paid" ? accessLabels[v.access] : null;
          const busyHere = busy?.endsWith(v.id);
          return (
            <li key={v.id} className="rounded-xl border border-line px-3 py-2" data-testid="deal-invoice">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium">{v.label}</span>
                <span className="tabular-nums">{formatPrice(v.amount)}</span>
                <span className="text-xs text-muted">{purposeLabels[v.purpose]}</span>
                {busyHere ? <LoaderCircle className="ml-auto size-3.5 animate-spin text-muted" /> : null}
              </div>
              <p className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-[11px]", tones[status.tone])}>{status.text}</p>
              {v.paidRef ? <p className="mt-0.5 text-[11px] text-muted">операция {v.paidRef}</p> : null}
              {v.viewedLabel && v.status === "pending_payment" && !v.claimedLabel ? <p className="mt-1 text-xs text-muted" data-testid="invoice-viewed">👁 Клиент открыл счёт {v.viewedLabel}, но пока не оплатил</p> : null}
              {v.claimedLabel && v.status !== "paid" ? <p className="mt-1 text-xs text-amber-800">Клиент сообщил об оплате переводом {v.claimedLabel} — проверьте поступление и примите оплату с чеком.</p> : null}
              {access ? <p className={cn("mt-1 text-xs", v.access === "failed" || v.access === "needs_manager" ? "text-red-700" : "text-muted")}>{access}</p> : null}
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {can.copy && v.link ? (
                  <button type="button" className="flex items-center gap-1 text-wine hover:underline" onClick={() => void copyText(v.link!, "Ссылка скопирована")}>
                    <Copy className="size-3.5" /> Скопировать ссылку
                  </button>
                ) : null}
                {can.resend ? (
                  <button type="button" disabled={!!busy} className="flex items-center gap-1 text-wine hover:underline disabled:opacity-50" onClick={() => void run(`resend:${v.id}`, () => resendInvoiceAction(v.id))}>
                    <Send className="size-3.5" /> Отправить ещё раз
                  </button>
                ) : null}
                {can.paid ? (
                  onPaid ? (
                    <button type="button" className="flex items-center gap-1 text-emerald-800 hover:underline" onClick={() => onPaid(v)}>
                      <HandCoins className="size-3.5" /> Оплата пришла
                    </button>
                  ) : (
                    <Link href={`/admin/deals/${dealId}?pay=${v.id}#deal-payments`} className="flex items-center gap-1 text-emerald-800 hover:underline">
                      <HandCoins className="size-3.5" /> Оплата пришла
                    </Link>
                  )
                ) : null}
                {can.access ? (
                  <button type="button" disabled={!!busy} className="flex items-center gap-1 text-wine hover:underline disabled:opacity-50" onClick={() => void run(`access:${v.id}`, () => resendInvoiceAccessAction({ invoiceId: v.id }))}>
                    <KeyRound className="size-3.5" /> Отправить доступ ещё раз
                  </button>
                ) : null}
                {can.pickAccount ? (
                  <button type="button" className="flex items-center gap-1 text-wine hover:underline" onClick={() => setPicking((p) => (p === v.id ? null : v.id))}>
                    <UserSearch className="size-3.5" /> Выбрать аккаунт и отправить доступ
                  </button>
                ) : null}
                {can.cancel ? (
                  <button type="button" disabled={!!busy} className="ml-auto flex items-center gap-1 text-muted hover:text-red-700 disabled:opacity-50" onClick={() => void cancel(v)}>
                    <Ban className="size-3.5" /> Отменить
                  </button>
                ) : null}
              </div>
              {picking === v.id && can.pickAccount ? (
                <AccountPicker
                  invoiceId={v.id}
                  onSend={(userId) =>
                    run(`access:${v.id}`, async () => {
                      const r = await resendInvoiceAccessAction({ invoiceId: v.id, userId });
                      if (r.ok) setPicking(null);
                      return r;
                    })
                  }
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Выбор аккаунта клиента для доступа: клиент сделки — сразу, остальные — поиском (контакты с маской по правам). */
function AccountPicker({ invoiceId, onSend }: { invoiceId: string; onSend: (userId: string) => Promise<void> }) {
  const [q, setQ] = useState("");
  const [accounts, setAccounts] = useState<AccessAccount[] | null>(null);
  const [chosen, setChosen] = useState("");
  const [busy, setBusy] = useState(false);

  const load = (term: string) =>
    invoiceAccountsAction({ invoiceId, q: term }).then(
      (r) => (r.ok ? setAccounts(r.accounts) : toast(r.message, "error")),
      (e: unknown) => toastError(e),
    );

  useEffect(() => {
    void load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- клиент сделки подгружается один раз при открытии
  }, [invoiceId]);

  return (
    <div className="mt-2 space-y-2 rounded-xl bg-cream/50 p-2.5" data-testid="access-picker">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          void load(q).finally(() => setBusy(false));
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} placeholder="Имя или почта клиента" className="input h-9 min-w-0 flex-1 text-xs" aria-label="Поиск клиента" />
        <button className="btn btn-outline btn-sm shrink-0" disabled={busy || q.trim().length < 2}>
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />} Найти
        </button>
      </form>
      {accounts === null ? (
        <p className="text-xs text-muted">Загружаем…</p>
      ) : accounts.length ? (
        <ul className="space-y-1">
          {accounts.map((a) => (
            <li key={a.id}>
              <label className="flex cursor-pointer items-start gap-2 text-xs">
                <input type="radio" name={`access-${invoiceId}`} checked={chosen === a.id} onChange={() => setChosen(a.id)} className="mt-0.5" />
                <span>
                  <span className="font-medium">{a.name}</span>
                  {a.contact ? <span className="text-muted"> · {a.contact}</span> : null}
                  {a.hint ? <span className="block text-[11px] text-muted">{a.hint}</span> : null}
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">Никого не нашли. Если аккаунта нет — заведите клиента в карточке сделки.</p>
      )}
      <button type="button" className="btn btn-sm" disabled={!chosen} onClick={() => void onSend(chosen)}>
        <KeyRound className="size-4" /> Отправить доступ этому клиенту
      </button>
    </div>
  );
}
