"use client";

import { cloneElement, isValidElement, useId } from "react";
import { cn } from "@/lib/class-names";
import { OPTIONAL_FIELD } from "@/lib/content/crm-labels";

/**
 * Поле формы (DESIGN.md §6): подпись над полем, подсказка и ошибка под ним; связи для экранного диктора
 * (htmlFor, aria-describedby, aria-invalid) проставляются сами — в children передаётся сам input/select/textarea.
 */
export function Field({ label, hint, error, children, className, optional }: { label: React.ReactNode; hint?: React.ReactNode; error?: React.ReactNode; children: React.ReactElement<Record<string, unknown>>; className?: string; /** Необязательное поле: строка — подпись из словаря (витрина, кабинет), true — русская подпись CRM. */
  optional?: boolean | string }) {
  const auto = useId();
  const id = (isValidElement(children) && typeof children.props.id === "string" ? children.props.id : null) ?? auto;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const control = isValidElement(children)
    ? cloneElement(children, { id, "aria-invalid": error ? true : undefined, "aria-describedby": [hintId, errorId].filter(Boolean).join(" ") || undefined })
    : children;
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={id} className="label">
        {label}
        {optional ? <span className="font-normal text-muted"> ({optional === true ? OPTIONAL_FIELD : optional})</span> : null}
      </label>
      {control}
      {error ? (
        <span id={errorId} className="field-error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span id={hintId} className="hint">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
