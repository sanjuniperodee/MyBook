import { BackLink } from "@/components/admin/BackLink";
import { Badge } from "@/components/ui/Badge";
import { formatPrice } from "@/config/site";
import { cn } from "@/lib/class-names";
import { Dot, dealNo } from "../ui";
import { OpenTabButton } from "./DealWorkspace";

/**
 * Шапка разворота сделки (DESIGN.md §7.2): крупный номер «Д12» и имя клиента, сумма и сколько получено, следующий шаг,
 * действия (позвонить, написать, принять оплату) и этап-линейка. Серверный компонент: клиентские куски — в слотах.
 */
export function DealHeader({
  number,
  name,
  title,
  meta,
  amount,
  paid,
  target,
  closed,
  lostReason,
  repeatCount,
  nextStep,
  canPay,
  contactActions,
  stageBar,
}: {
  number: number;
  /** Имя клиента; пусто — название сделки. */
  name: string;
  title: string;
  /** «Создана 27 октября, источник: Сайт». */
  meta: string;
  amount: number;
  paid: number;
  /** Сколько всего нужно получить (с заказом — по заказу). */
  target: number;
  closed: boolean;
  lostReason: string | null;
  repeatCount: number;
  nextStep: { title: string; dueLabel: string | null; overdue: boolean } | null;
  canPay: boolean;
  contactActions: React.ReactNode;
  stageBar: React.ReactNode;
}) {
  const left = Math.max(0, target - paid);
  return (
    <div className="flex flex-col gap-1.5">
      <BackLink href="/admin/deals">Сделки</BackLink>
      <section className="panel overflow-hidden" aria-label="Сделка">
        <div className="flex flex-wrap items-start gap-x-8 gap-y-3 p-4 sm:p-5">
          <div className="min-w-0 flex-1 basis-72">
            <h1 className="flex flex-wrap items-baseline gap-x-3 text-[22px] leading-tight font-semibold tracking-[-0.015em] break-words lg:text-2xl">
              <span className="font-medium text-muted tabular-nums" data-testid="deal-number">
                {dealNo(number)}
              </span>
              <span className="min-w-0">{name || title}</span>
            </h1>
            <p className="mt-1.5 text-sm text-muted">
              {name && title ? <span className="text-ink-soft">{title}</span> : null}
              {name && title ? " · " : ""}
              {meta}
            </p>
            {closed && lostReason ? (
              <p className="mt-2">
                <Badge tone="danger">Отказ: {lostReason}</Badge>
              </p>
            ) : null}
            {repeatCount > 0 ? (
              <p className="mt-2">
                <span className="badge badge-info" title={`Покупок до этой сделки: ${repeatCount}`} data-testid="deal-repeat">
                  повторный клиент
                </span>
              </p>
            ) : null}
          </div>
          <div className="shrink-0 text-right max-sm:text-left" data-testid="deal-sum">
            <div className="text-2xl leading-tight font-semibold tracking-[-0.02em] tabular-nums lg:text-[28px]">{amount || target ? formatPrice(amount || target) : "без суммы"}</div>
            {target > 0 ? (
              <div className="mt-1 text-xs text-muted tabular-nums">
                <span className={cn(paid > 0 && "text-success")}>получено {formatPrice(paid)}</span>
                {left > 0 ? `, осталось ${formatPrice(left)}` : paid >= target ? ", оплачено полностью" : ""}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1 basis-64 text-sm" data-testid="deal-next-step">
            {nextStep ? (
              <>
                <span className="text-muted">Следующий шаг </span>
                <span className="font-medium">{nextStep.title}</span>
                {nextStep.dueLabel ? (
                  <span className={cn("ml-2 inline-flex items-center gap-1 tabular-nums", nextStep.overdue ? "font-medium text-danger" : "text-muted")}>
                    {nextStep.overdue ? <Dot className="bg-danger" /> : null}
                    {nextStep.overdue ? "просрочена, " : ""}
                    {nextStep.dueLabel}
                  </span>
                ) : null}
              </>
            ) : closed ? (
              <span className="text-muted">Сделка закрыта</span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-warning">
                <Dot className="bg-warning" /> Следующего шага нет —{" "}
                <OpenTabButton tab="overview" scrollTo="deal-task-title" className="font-medium underline underline-offset-2">
                  поставьте задачу
                </OpenTabButton>
              </span>
            )}
          </div>
          <div className="deal-actionbar flex items-center gap-2 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-[var(--tabbar-h)] max-lg:z-20 max-lg:border-t max-lg:border-line max-lg:bg-white max-lg:p-2.5 max-lg:pl-[max(0.625rem,env(safe-area-inset-left))] max-lg:pr-[max(0.625rem,env(safe-area-inset-right))] lg:min-w-72">{contactActions}</div>
          {canPay ? (
            <OpenTabButton tab="money" scrollTo="deal-payment-form" className="btn btn-primary max-lg:w-full">
              Принять оплату
            </OpenTabButton>
          ) : null}
        </div>

        <div className="border-t border-line bg-sunken/50 px-3 py-2 sm:px-4">{stageBar}</div>
      </section>
    </div>
  );
}
