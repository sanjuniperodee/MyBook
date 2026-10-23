"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { CalendarDays, Plus, Trash2, X } from "lucide-react";
import { useLocale } from "@/i18n/client";
import { dateFor } from "@/i18n/messages/partial";
import { usefulUi2 } from "@/lib/content/tools/ui";
import { buildIcs } from "@/lib/tools/ics";
import { familyEvents, MAX_PEOPLE, parsePeople, RELATIONS, rowsFor, STORAGE_KEY_FAMILY, type Person } from "@/lib/tools/family";
import { parseDay } from "@/lib/tools/together";
import { Choice } from "./Choice";
import { createLocalStore } from "./localStore";

const store = createLocalStore(STORAGE_KEY_FAMILY);

/** Семейный календарь: близкие, их дни рождения и мүшел, файл календаря с напоминаниями. Список хранится в браузере. */
export function FamilyCalendar() {
  const locale = useLocale();
  const ui = usefulUi2[locale].family;
  const ui2 = usefulUi2[locale].mushel;
  const fmt = dateFor(locale);
  const raw = useSyncExternalStore(store.subscribe, store.read, () => null);
  const people = useMemo(() => parsePeople(raw), [raw]);
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  const [birth, setBirth] = useState("");
  const [lead, setLead] = useState<"7" | "14" | "30">("14");
  // «Сегодня» берём при каждом изменении списка: до первого действия строк нет, так что сервер и браузер совпадают.
  const rows = useMemo(() => rowsFor(people, new Date()), [people]);

  const save = (next: Person[]) => store.write(next.length ? JSON.stringify(next) : null);
  const valid = name.trim().length > 0 && !!parseDay(birth) && people.length < MAX_PEOPLE;

  const add = () => {
    if (!valid) return;
    save([...people, { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: name.trim(), relation, birth }]);
    setName("");
    setBirth("");
  };

  const download = () => {
    const ics = buildIcs(familyEvents(rows, { ...ui.ics, animal: (a) => ui2.animal[a] }, Number(lead)), { calendarName: ui.ics.calendarName });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = ui.icsName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="card p-6 sm:p-8">
      <div className="grid gap-4 sm:grid-cols-[1.3fr_1fr_1fr_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="fam-name">
            {ui.nameLabel}
          </label>
          <input id="fam-name" className="input" maxLength={60} value={name} placeholder={ui.namePlaceholder} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        </div>
        <div>
          <label className="label" htmlFor="fam-rel">
            {ui.relationLabel}
          </label>
          <select id="fam-rel" className="input" value={relation} onChange={(e) => setRelation(e.target.value)}>
            {["", ...RELATIONS].map((r) => (
              <option key={r} value={r}>
                {ui.relation[r]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="fam-birth">
            {ui.birthLabel}
          </label>
          <input id="fam-birth" type="date" className="input" value={birth} onChange={(e) => setBirth(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        </div>
        <button type="button" className="btn btn-primary h-12" disabled={!valid} onClick={add}>
          <Plus className="size-4" /> {ui.add}
        </button>
      </div>
      {people.length >= MAX_PEOPLE ? <p className="mt-2 text-sm text-wine">{ui.full}</p> : null}

      <div className="mt-8" aria-live="polite">
        {rows.length === 0 ? (
          <p className="rounded-2xl bg-cream/60 px-5 py-6 text-center text-muted">{ui.empty}</p>
        ) : (
          <>
            <ul className="space-y-3">
              {rows.map((r) => (
                <li key={r.person.id} className="rounded-2xl border border-line bg-white p-4" data-testid="family-row">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-ink">{r.person.name}</div>
                      <div className="text-sm text-muted">{[ui.relation[r.person.relation] && r.person.relation ? ui.relation[r.person.relation] : "", `${ui.cols.age}: ${r.age}`, `${ui.cols.animal}: ${ui2.animal[r.animal]}`].filter(Boolean).join(" · ")}</div>
                    </div>
                    <button type="button" className="btn btn-ghost btn-sm size-9 shrink-0 p-0" aria-label={`${ui.remove}: ${r.person.name}`} onClick={() => save(people.filter((p) => p.id !== r.person.id))}>
                      <X className="size-4" />
                    </button>
                  </div>
                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                    <div className="rounded-xl bg-cream/60 px-3 py-2">
                      <dt className="text-xs text-muted">{ui.cols.birthday}</dt>
                      <dd className="font-medium text-ink">
                        {fmt(r.nextBirthday, true)} · {ui.inDays(r.daysToBirthday)}
                      </dd>
                      <dd className="text-xs text-ink-soft">{ui.turning(r.turning)}</dd>
                    </div>
                    <div className="rounded-xl bg-rose/30 px-3 py-2">
                      <dt className="text-xs text-muted">{ui.cols.mushel}</dt>
                      <dd className="font-medium text-ink">{r.mushel ? ui.mushelCell(r.mushel.year, r.mushel.traditionalAge, r.mushel.days) : ui.noMushel}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex flex-wrap items-end gap-4">
              <div>
                <span className="label">{ui.leadLabel}</span>
                <Choice label={ui.leadLabel} value={lead} onChange={setLead} options={(["7", "14", "30"] as const).map((id) => ({ id, label: ui.lead[id] }))} />
              </div>
              <button type="button" className="btn btn-primary" onClick={download}>
                <CalendarDays className="size-4" /> {ui.download}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  if (window.confirm(ui.clearConfirm)) store.write(null);
                }}
              >
                <Trash2 className="size-4" /> {ui.clear}
              </button>
            </div>
          </>
        )}
      </div>
      <p className="mt-6 text-xs leading-relaxed text-muted">
        {ui.saved} {ui.privacy}
      </p>
    </div>
  );
}
