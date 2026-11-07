"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookCopy, CircleCheck, ExternalLink, LoaderCircle, Undo2 } from "lucide-react";
import { ActionMenu, menuItemClass } from "@/components/admin/ActionMenu";
import { SidePanel } from "@/components/admin/SidePanel";
import { RefundPanel, UpgradePanel } from "@/components/admin/money/MoneyPanels";
import { Alert } from "@/components/ui/Alert";
import { Field } from "@/components/ui/Field";
import { toast } from "@/components/ui/overlays";
import { formatPrice } from "@/config/site";
import type { FinanceScreen } from "@/modules/reporting/ui/finance-screen";
import { resolveFinanceIssueAction, undoFinanceResolutionAction } from "./actions";

type Issue = FinanceScreen["issues"][number];

/** Что сотрудник может сделать в очереди (права проверяет и сервер). */
export interface IssuePerms {
  /** Возврат по сделке: deals.edit (и сделка своя у роли «только свои» — проверит роут). */
  refundDeal: boolean;
  /** Возврат и «в печатную» по заказу: orders.edit. */
  editOrder: boolean;
  /** «Отметить решённым» по сделке и Kaspi: team.manage. */
  resolveDeal: boolean;
  /** «Отметить решённым» по заказу: team.manage и orders.edit. */
  resolveOrder: boolean;
}

type Action = "refund" | "upgrade" | "resolve" | "open";

/**
 * Действия строки «Нужно вернуть или зачесть»: главное по смыслу случая — кнопкой, остальное — в «⋯». Сделка: вернуть
 * клиенту, отметить решённым, открыть сделку. Переплата заказа: вернуть, перевести в печатную (у электронной версии),
 * отметить решённым, открыть заказ. Отменённый заказ: вернуть, отметить решённым. Оплата Kaspi вне учёта — отметить
 * решённым, открыть. Нет права на действие — его нет в списке.
 */
export function IssueActions({ issue, perms }: { issue: Issue; perms: IssuePerms }) {
  const [panel, setPanel] = useState<Action | null>(null);
  const target = issue.target;
  const canRefund = !!target && (target.kind === "deal" ? perms.refundDeal : perms.editOrder);
  const canResolve = issue.kind === "order_overpaid" || issue.kind === "order_cancelled" ? perms.resolveOrder : perms.resolveDeal;
  const actions: Action[] = [];
  if (issue.kind === "unrecorded") {
    if (canResolve) actions.push("resolve");
    if (issue.href) actions.push("open");
  } else {
    if (canRefund) actions.push("refund");
    if (issue.canUpgrade && perms.editOrder) actions.push("upgrade");
    if (canResolve) actions.push("resolve");
    if (issue.href) actions.push("open");
  }
  const [primary, ...rest] = actions;
  if (!primary) return null;
  const openLabel = target?.kind === "deal" ? "Открыть сделку" : target?.kind === "order" ? "Открыть заказ" : "Открыть";
  const label: Record<Action, string> = {
    refund: "Вернуть клиенту",
    upgrade: "Перевести в печатную",
    resolve: "Отметить решённым",
    open: openLabel,
  };
  const icon: Record<Action, React.ReactNode> = {
    refund: <Undo2 className="size-4" aria-hidden />,
    upgrade: <BookCopy className="size-4" aria-hidden />,
    resolve: <CircleCheck className="size-4" aria-hidden />,
    open: <ExternalLink className="size-4" aria-hidden />,
  };
  const button = (a: Action, cls: string) =>
    a === "open" ? (
      <Link key={a} href={issue.href!} className={cls} role={cls === menuItemClass ? "menuitem" : undefined}>
        {icon[a]} {label[a]}
      </Link>
    ) : (
      <button key={a} type="button" className={cls} role={cls === menuItemClass ? "menuitem" : undefined} onClick={() => setPanel(a)} data-testid={`issue-${a}`}>
        {icon[a]} {label[a]}
      </button>
    );
  return (
    <div className="flex items-center gap-1.5">
      {button(primary, "btn btn-outline btn-sm whitespace-nowrap")}
      {rest.length ? (
        <ActionMenu iconOnly label="Другие действия">
          {rest.map((a) => button(a, menuItemClass))}
        </ActionMenu>
      ) : null}
      {target && canRefund ? (
        <RefundPanel
          open={panel === "refund"}
          onClose={() => setPanel(null)}
          target={{
            kind: target.kind,
            id: target.id,
            label: issue.ref,
            amount: issue.amount,
            max: issue.amount,
          }}
        />
      ) : null}
      {target?.kind === "order" && issue.canUpgrade ? (
        <UpgradePanel
          open={panel === "upgrade"}
          onClose={() => setPanel(null)}
          order={{
            id: target.id,
            number: target.number,
            received: issue.received ?? 0,
          }}
        />
      ) : null}
      {canResolve ? <ResolvePanel issue={issue} open={panel === "resolve"} onClose={() => setPanel(null)} /> : null}
    </div>
  );
}

/** «Отметить решённым»: комментарий, как решили. Случай скрывается, пока его сумма не изменится. */
function ResolvePanel({ issue, open, onClose }: { issue: Issue; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = () =>
    start(async () => {
      setError(null);
      if (note.trim().length < 3) return setError("Напишите, как решили: от 3 символов");
      const r = await resolveFinanceIssueAction(issue.key, issue.amount, note).catch(
        () =>
          ({
            error: "Не удалось сохранить — недостаточно прав или нет связи",
          }) as { error: string; ok?: string },
      );
      if (r.error) return setError(r.error);
      toast(r.ok ?? "Отмечено решённым");
      setNote("");
      onClose();
      router.refresh();
    });
  return (
    <SidePanel open={open} onClose={onClose} title="Отметить решённым" description={`${issue.title}: ${issue.ref}, ${formatPrice(issue.amount)}`}>
      <form
        className="space-y-4"
        data-testid="resolve-panel"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Как решили" hint="Например: вернули 5 000 ₸ наличными, остальное зачли в заказ №12">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} required minLength={3} maxLength={500} rows={4} className="input" />
        </Field>
        <p className="text-xs text-muted">Случай уйдёт из очереди. Если сумма по нему изменится, он вернётся.</p>
        {error ? <Alert>{error}</Alert> : null}
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-dark" disabled={pending}>
            {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null} Отметить решённым
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Отмена
          </button>
        </div>
      </form>
    </SidePanel>
  );
}

/** «Отменить решение» в блоке «Решённые»: случай снова в очереди, если деньги по нему всё ещё не сходятся. */
export function UndoResolution({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm whitespace-nowrap"
      disabled={pending}
      data-testid="finance-undo-resolution"
      onClick={() =>
        start(async () => {
          const r = await undoFinanceResolutionAction(id).catch(
            () =>
              ({
                error: "Не удалось отменить — недостаточно прав или нет связи",
              }) as { error: string; ok?: string },
          );
          if (r.error) toast(r.error, "error");
          else {
            toast(r.ok ?? "Решение отменено");
            router.refresh();
          }
        })
      }
    >
      {pending ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : null} Отменить решение
    </button>
  );
}
