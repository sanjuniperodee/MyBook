/**
 * Семейный календарь: дни рождения близких, их мүшел и файл календаря с напоминаниями. Данные хранятся в браузере.
 */
import { anniversaryDate, daysBetween, parseDay } from "./together";
import { mushelInfo, animalOf, type Animal } from "./mushel";
import type { IcsEvent } from "./ics";

export interface Person {
  id: string;
  name: string;
  /** Ключ родства из словаря интерфейса; пустой — не указано. */
  relation: string;
  /** День рождения, YYYY-MM-DD. */
  birth: string;
}

export const MAX_PEOPLE = 30;
export const STORAGE_KEY_FAMILY = "mb_family_v1";
export const RELATIONS = ["mom", "dad", "grandma", "grandpa", "spouse", "partner", "sister", "brother", "child", "friend", "other"] as const;

/** Читает сохранённое: мусор и неполные записи отбрасываются, лишнее обрезается. */
export function parsePeople(raw: string | null): Person[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    const out: Person[] = [];
    for (const x of v) {
      const p = (x ?? {}) as Partial<Person>;
      if (typeof p.name !== "string" || typeof p.birth !== "string" || !parseDay(p.birth)) continue;
      out.push({ id: typeof p.id === "string" ? p.id.slice(0, 40) : String(out.length), name: p.name.slice(0, 60), relation: typeof p.relation === "string" ? p.relation.slice(0, 20) : "", birth: p.birth });
    }
    return out.slice(0, MAX_PEOPLE);
  } catch {
    return [];
  }
}

export interface PersonRow {
  person: Person;
  age: number;
  /** Ближайший день рождения и сколько до него дней (0 — сегодня). */
  nextBirthday: Date;
  daysToBirthday: number;
  /** Сколько лет исполнится. */
  turning: number;
  animal: Animal;
  /** Ближайший мүшел и день рождения, в который он отмечается (null — все прошли). */
  mushel: { year: number; traditionalAge: number; date: Date; days: number } | null;
}

/** Ближайший день рождения: сегодня ещё считается. */
export function nextBirthday(birth: Date, now: Date): { date: Date; turning: number } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let years = today.getFullYear() - birth.getFullYear();
  let d = anniversaryDate(birth, years);
  if (d < today) {
    years++;
    d = anniversaryDate(birth, years);
  }
  return { date: d, turning: years };
}

export function personRow(person: Person, now: Date): PersonRow | null {
  const birth = parseDay(person.birth);
  if (!birth) return null;
  const nb = nextBirthday(birth, now);
  const m = mushelInfo(birth.getFullYear(), birth.getMonth() + 1, birth.getDate(), now);
  // Мүшел отмечают в день рождения того года; если в этом году день рождения уже прошёл — берём следующий круг.
  const rounds = m.rounds.filter((r) => anniversaryDate(birth, r.n * 12) >= new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const r = rounds[0] ?? null;
  const date = r ? anniversaryDate(birth, r.n * 12) : null;
  return {
    person,
    age: m.age,
    nextBirthday: nb.date,
    daysToBirthday: daysBetween(now, nb.date),
    turning: nb.turning,
    animal: animalOf(birth.getFullYear()),
    mushel: r && date ? { year: r.year, traditionalAge: r.traditionalAge, date, days: daysBetween(now, date) } : null,
  };
}

export function rowsFor(people: readonly Person[], now: Date): PersonRow[] {
  return people.map((p) => personRow(p, now)).filter((r): r is PersonRow => !!r).sort((a, b) => a.daysToBirthday - b.daysToBirthday);
}

export interface FamilyIcsText {
  birthday: (name: string, turning: number) => string;
  birthdayDescription: (name: string, animal: string) => string;
  alarmWeeks: (name: string) => string;
  alarmDay: (name: string) => string;
  mushel: (name: string, age: number) => string;
  mushelAlarm: (name: string, age: number) => string;
  animal: (a: Animal) => string;
}

/**
 * События для календаря: день рождения каждый год (с напоминанием за lead дней и накануне) и отдельное событие на
 * ближайший мүшел — с напоминанием за два месяца, чтобы хватило времени на подарок.
 */
export function familyEvents(rows: readonly PersonRow[], t: FamilyIcsText, leadDays: number): IcsEvent[] {
  const events: IcsEvent[] = [];
  for (const r of rows) {
    const { person: p } = r;
    const b = parseDay(p.birth)!;
    // 29 февраля: в невисокие годы событие — на последний день февраля.
    const leap = b.getMonth() === 1 && b.getDate() === 29;
    events.push({
      uid: `bd-${p.id}@mybook.kz`,
      date: r.nextBirthday,
      summary: t.birthday(p.name, r.turning),
      description: t.birthdayDescription(p.name, t.animal(r.animal)),
      rrule: leap ? "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1" : "FREQ=YEARLY",
      alarms: [
        { trigger: `-P${leadDays}D`, text: t.alarmWeeks(p.name) },
        { trigger: "-P1D", text: t.alarmDay(p.name) },
      ],
    });
    if (r.mushel)
      events.push({
        uid: `mushel-${p.id}-${r.mushel.year}@mybook.kz`,
        date: r.mushel.date,
        summary: t.mushel(p.name, r.mushel.traditionalAge),
        alarms: [
          { trigger: "-P60D", text: t.mushelAlarm(p.name, r.mushel.traditionalAge) },
          { trigger: `-P${leadDays}D`, text: t.mushelAlarm(p.name, r.mushel.traditionalAge) },
        ],
      });
  }
  return events;
}
