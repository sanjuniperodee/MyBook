"use client";

import { useRouter } from "next/navigation";
import { ArchiveRestore } from "lucide-react";
import { toast, toastError } from "@/components/ui/overlays";
import { boardsApi } from "./client";

export function RestoreBoard({ id }: { id: string }) {
  const router = useRouter();
  return (
    <button type="button" className="btn btn-outline btn-sm" onClick={() => boardsApi.updateBoard(id, { archived: false }).then(() => (toast("Доска возвращена"), router.refresh()), toastError)}>
      <ArchiveRestore className="size-4" aria-hidden /> Вернуть
    </button>
  );
}
