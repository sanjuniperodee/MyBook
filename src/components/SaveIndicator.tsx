"use client";

import { Check, CloudOff, LoaderCircle } from "lucide-react";
import type { SaveStatus } from "@/hooks/useAutosave";
import { cn } from "@/lib/utils";

export function SaveIndicator({ status, error, className }: { status: SaveStatus; error?: string | null; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", status === "error" ? "text-red-700" : "text-muted", className)} aria-live="polite">
      {status === "saving" || status === "dirty" ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
      {status === "saved" || status === "idle" ? <Check key="ok" className="size-3.5 animate-pop text-emerald-600" /> : null}
      {status === "error" ? <CloudOff className="size-3.5" /> : null}
      {status === "saving" || status === "dirty" ? "Сохраняем…" : status === "error" ? error || "Не сохранено" : "Сохранено"}
    </span>
  );
}
