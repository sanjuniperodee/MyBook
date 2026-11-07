"use client";

import { useActionState } from "react";
import { Actions, Field, Group, Note, Result, SaveButton, Section } from "../ui";
import type { SettingsState } from "../state";
import { saveTransferAction } from "./actions";

/** «Оплата переводом»: номер Kaspi и имя получателя, которые клиент видит на странице оплаты. */
export function TransferForm({ phone, name, fromEnv }: { phone: string; name: string; fromEnv: boolean }) {
  const [state, action] = useActionState<SettingsState, FormData>(saveTransferAction, {});
  return (
    <Section
      id="transfer"
      title="Оплата переводом"
      description="Клиент переводит по номеру в Kaspi и жмёт «Я оплатил(а)»; менеджер проверяет поступление и прикладывает чек"
      status={phone ? { tone: "ok", label: "показывается клиентам" } : { tone: "off", label: "выключена" }}
    >
      <form action={action} className="space-y-5">
        <Group title="Получатель перевода" hint="Без номера перевод не показывается: оплата останется только Kaspi Pay или картой.">
          <Field label="Номер получателя Kaspi">
            <input name="phone" defaultValue={phone} disabled={fromEnv} placeholder="+7 7__ ___ __ __" inputMode="tel" className="input" />
          </Field>
          <Field label="Имя получателя (как в Kaspi)" hint="Клиент сверяет его в приложении перед переводом.">
            <input name="name" defaultValue={name} disabled={fromEnv} placeholder="ИП «MyBooks»" className="input" />
          </Field>
        </Group>
        {fromEnv ? (
          <Note>Задано переменными окружения сервера (TRANSFER_PHONE, TRANSFER_NAME), здесь не меняется.</Note>
        ) : (
          <Actions>
            <SaveButton />
            <Result state={state} />
          </Actions>
        )}
      </form>
    </Section>
  );
}
