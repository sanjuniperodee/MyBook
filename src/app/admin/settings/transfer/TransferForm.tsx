"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Result, Section, Status } from "../ui";
import type { SettingsState } from "../state";
import { saveTransferAction } from "./actions";

/** «Оплата переводом»: номер Kaspi и имя получателя, которые клиент видит на странице оплаты. */
export function TransferForm({ phone, name, fromEnv }: { phone: string; name: string; fromEnv: boolean }) {
  const [state, action] = useActionState<SettingsState, FormData>(saveTransferAction, {});
  return (
    <Section title="Оплата переводом" badge={<Status on={!!phone} label={phone ? "показывается клиентам" : "выключена"} />}>
      <form action={action} className="space-y-3">
        <p className="text-xs text-muted">Клиент переводит по номеру в Kaspi и жмёт «Я оплатил(а)» — менеджер проверяет поступление и прикладывает чек. Без номера перевод не показывается (оплата — Kaspi Pay или картой).</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Номер получателя Kaspi</span>
            <input name="phone" defaultValue={phone} disabled={fromEnv} placeholder="+7 7__ ___ __ __" className="input h-10 text-sm" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Имя получателя (как в Kaspi)</span>
            <input name="name" defaultValue={name} disabled={fromEnv} placeholder="ИП «MyBooks»" className="input h-10 text-sm" />
          </label>
        </div>
        {fromEnv ? (
          <p className="text-xs text-muted">Задано переменными окружения сервера (TRANSFER_PHONE, TRANSFER_NAME).</p>
        ) : (
          <div className="flex items-center gap-3">
            <SubmitButton className="btn-sm">Сохранить</SubmitButton>
            <Result state={state} />
          </div>
        )}
      </form>
    </Section>
  );
}
