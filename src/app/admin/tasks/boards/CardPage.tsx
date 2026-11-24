"use client";

import { useRouter } from "next/navigation";
import { CardDialog } from "./CardDialog";
import type { Staff } from "./client";

/** Карточка доски на странице задачи (/admin/tasks/<id>): листом; удалили — обратно к доске. */
export function CardPage({ id, staff, me, back }: { id: string; staff: Staff[]; me: string; back: string }) {
  const router = useRouter();
  return <CardDialog inline id={id} staff={staff} me={me} onClose={() => router.push(back)} onChanged={() => router.refresh()} />;
}
