"use client";

import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/class-names";

/** Кнопка отправки формы со счётчиком ожидания. `dark` — для действия внутри листа, когда винная кнопка у экрана уже есть (DESIGN.md §3). */
export function SubmitButton({ children, className, pendingText, variant = "primary" }: { children: React.ReactNode; className?: string; pendingText?: string; variant?: "primary" | "dark" | "danger" }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={cn("btn", variant === "dark" ? "btn-dark" : variant === "danger" ? "btn-danger" : "btn-primary", className)}>
      {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}
