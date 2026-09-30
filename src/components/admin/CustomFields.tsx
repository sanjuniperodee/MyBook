"use client";

import type { CustomValues } from "@/lib/db/schema";

export interface FieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "checkbox";
  options: string[];
}

/** Поля ввода для своих полей: имена cf_<key>, читаются на сервере readFieldValues(). */
export function CustomFieldInputs({ fields, values, disabled }: { fields: FieldDef[]; values: CustomValues; disabled?: boolean }) {
  if (!fields.length) return null;
  return (
    <div className="grid grid-cols-2 gap-3" data-testid="custom-fields">
      {fields.map((f) => {
        const v = values[f.key];
        const name = `cf_${f.key}`;
        const common = { name, disabled, className: "input h-9 text-sm", "aria-label": f.label };
        return (
          <label key={f.key} className={f.type === "text" ? "col-span-2 block" : "block"}>
            <span className="mb-1 block text-xs text-muted">{f.label}</span>
            {f.type === "select" ? (
              <select {...common} defaultValue={typeof v === "string" ? v : ""}>
                <option value="">—</option>
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : f.type === "checkbox" ? (
              <span className="flex h-9 items-center">
                <input type="hidden" name={`${name}__present`} value="1" />
                <input type="checkbox" name={name} defaultChecked={v === true} disabled={disabled} className="size-4 accent-wine" aria-label={f.label} />
              </span>
            ) : (
              <input {...common} type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} defaultValue={v === null || v === undefined ? "" : String(v)} maxLength={500} />
            )}
          </label>
        );
      })}
    </div>
  );
}
