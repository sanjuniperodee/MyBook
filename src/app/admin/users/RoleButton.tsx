"use client";

import { useTransition } from "react";
import { setUserRoleAction } from "../actions";

export function RoleButton({ userId, role }: { userId: string; role: "user" | "admin" }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      className={role === "admin" ? "rounded-full bg-wine/10 px-2.5 py-1 text-xs text-wine" : "rounded-full bg-cream px-2.5 py-1 text-xs"}
      title="Нажмите, чтобы изменить роль"
      onClick={() => {
        const next = role === "admin" ? "user" : "admin";
        if (confirm(next === "admin" ? "Выдать права администратора?" : "Снять права администратора?"))
          start(async () => {
            try {
              await setUserRoleAction(userId, next);
            } catch (e) {
              alert((e as Error).message);
            }
          });
      }}
    >
      {role === "admin" ? "Администратор" : "Клиент"}
    </button>
  );
}
