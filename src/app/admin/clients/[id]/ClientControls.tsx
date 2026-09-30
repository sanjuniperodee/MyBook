"use client";

import { useActionState, useState, useTransition } from "react";
import { CustomFieldInputs, type FieldDef } from "@/components/admin/CustomFields";
import type { CustomValues } from "@/lib/db/schema";
import { BellRing, LoaderCircle, Plus, X } from "lucide-react";
import { remindClientAction, updateClientTagsAction } from "../../actions";
import { setClientFieldsAction, setClientManagerAction, setClientPhonesAction } from "../../crm-actions";
import { toast } from "@/components/ui/overlays";
import { ManagerSelect } from "@/components/admin/ContactActions";
import { cn } from "@/lib/utils";

const suggested = ["vip", "блогер", "корпоратив", "повторный", "жалоба", "опт"];

export function TagEditor({ clientId, tags }: { clientId: string; tags: string[] }) {
  const [list, setList] = useState(tags);
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  const save = (next: string[]) => {
    setList(next);
    start(() => updateClientTagsAction(clientId, next));
  };
  const add = (t: string) => {
    const tag = t.trim().toLowerCase();
    if (tag && !list.includes(tag)) save([...list, tag]);
    setValue("");
  };
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {list.map((t) => (
          <span key={t} className="flex items-center gap-1 rounded-full bg-rose px-2.5 py-1 text-xs text-wine">
            {t}
            <button onClick={() => save(list.filter((x) => x !== t))} aria-label={`Убрать тег ${t}`}>
              <X className="size-3" />
            </button>
          </span>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add(value);
          }}
          className="flex items-center"
        >
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="тег" maxLength={30} className="h-7 w-24 rounded-full border border-line bg-white px-2.5 text-xs outline-none focus:border-wine/40" />
          <button className="ml-1 text-muted hover:text-ink" aria-label="Добавить тег">
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
          </button>
        </form>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {suggested
          .filter((s) => !list.includes(s))
          .map((s) => (
            <button key={s} onClick={() => add(s)} className="rounded-full border border-dashed border-line px-2 py-0.5 text-[11px] text-muted hover:border-ink/30 hover:text-ink">
              + {s}
            </button>
          ))}
      </div>
    </div>
  );
}

export function RemindButton({ clientId, disabled, hint }: { clientId: string; disabled: boolean; hint: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div>
      <button
        className="btn btn-outline btn-sm w-full"
        disabled={disabled || pending}
        onClick={() =>
          start(async () => {
            const res = await remindClientAction(clientId);
            setMsg({ ok: res.ok, text: res.message });
          })
        }
      >
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <BellRing className="size-4" />} Напомнить дописать книгу
      </button>
      <p className={cn("mt-1.5 text-xs", msg ? (msg.ok ? "text-emerald-700" : "text-red-700") : "text-muted")}>{msg?.text ?? hint}</p>
    </div>
  );
}

export function ClientManager({ clientId, value, options, disabled }: { clientId: string; value: string | null; options: { id: string; label: string }[]; disabled?: boolean }) {
  return <ManagerSelect value={value} options={options} disabled={disabled} onChange={(v) => setClientManagerAction(clientId, v)} />;
}

export function ExtraPhones({ clientId, value }: { clientId: string; value: string }) {
  const [text, setText] = useState(value);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await setClientPhonesAction(clientId, text);
          toast(r.ok ? (r.message ?? "Сохранено") : r.message, r.ok ? "success" : "error");
        });
      }}
    >
      <input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder="второй номер, WhatsApp" className="input h-9 min-w-0 flex-1 text-sm" aria-label="Доп. телефоны" />
      <button className="btn btn-outline btn-sm h-9" disabled={pending || text === value}>
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : "OK"}
      </button>
    </form>
  );
}

export function ClientFields({ clientId, fields, values, disabled }: { clientId: string; fields: FieldDef[]; values: CustomValues; disabled: boolean }) {
  const [state, action] = useActionState(setClientFieldsAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="clientId" value={clientId} />
      <CustomFieldInputs fields={fields} values={values} disabled={disabled} />
      {disabled ? null : (
        <div className="flex items-center gap-3">
          <button className="btn btn-outline btn-sm">Сохранить</button>
          {state.error ? <span className="text-xs text-red-700">{state.error}</span> : state.ok ? <span className="text-xs text-emerald-700">{state.ok}</span> : null}
        </div>
      )}
    </form>
  );
}
