/**
 * Мүшел жас: каждые 12 лет, когда снова наступает год животного, под которым человек родился, по двенадцатилетнему
 * календарю. По традиционному счёту, где год рождения — первый, это 13, 25, 37, 49, 61, 73 и 85 лет (полных лет — 12, 24 и т.д.).
 * Год рождения берётся календарный; животное года — по общему двенадцатилетнему кругу (тышқан — 1900, 1912… и так далее).
 */
export const ANIMALS = ["rat", "ox", "tiger", "rabbit", "dragon", "snake", "horse", "goat", "monkey", "rooster", "dog", "pig"] as const;
export type Animal = (typeof ANIMALS)[number];

/** Животное года по календарному году (2000 — дракон, ұлу). */
export function animalOf(year: number): Animal {
  return ANIMALS[(((year - 4) % 12) + 12) % 12];
}

/** Сколько мүшел-кругов учитываем: до 85 лет по традиционному счёту. */
export const MUSHEL_COUNT = 7;

export interface MushelRound {
  /** Какой по счёту мүшел (1–7). */
  n: number;
  year: number;
  /** Полных лет в этом году на день рождения и традиционный возраст (+1). */
  age: number;
  traditionalAge: number;
  state: "past" | "current" | "future";
}

export interface MushelInfo {
  animal: Animal;
  /** Полных лет на текущую дату и традиционный возраст (год рождения — первый). */
  age: number;
  traditionalAge: number;
  rounds: MushelRound[];
  /** Ближайший мүшел: идущий в этом году или следующий. Нет — прошли все семь. */
  next: MushelRound | null;
}

export function mushelInfo(birthYear: number, birthMonth: number, birthDay: number, now: Date): MushelInfo {
  const year = now.getFullYear();
  const beforeBirthday = now.getMonth() + 1 < birthMonth || (now.getMonth() + 1 === birthMonth && now.getDate() < birthDay);
  const age = year - birthYear - (beforeBirthday ? 1 : 0);
  const rounds: MushelRound[] = Array.from({ length: MUSHEL_COUNT }, (_, i) => {
    const n = i + 1;
    const y = birthYear + 12 * n;
    return { n, year: y, age: 12 * n, traditionalAge: 12 * n + 1, state: y < year ? "past" : y === year ? "current" : "future" };
  });
  return { animal: animalOf(birthYear), age, traditionalAge: year - birthYear + 1, rounds, next: rounds.find((r) => r.state !== "past") ?? null };
}
