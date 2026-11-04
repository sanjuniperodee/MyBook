/**
 * Нормализация DTO для сравнения «in-process ↔ HTTP» и golden-снимков.
 * Чистая функция: без БД, Next.js и модулей — её используют и сервер, и скрипты.
 */

/** Date → ISO, BigInt → строка, ключи объектов — по алфавиту; массивы сохраняют порядок. */
export function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) out[key] = normalize(source[key]);
    return out;
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  return value;
}

export interface ParityDiff {
  /** Путь до отличающегося поля: `$.book.rows[0].id`. */
  path: string;
  inprocess: unknown;
  remote: unknown;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date);

/**
 * Рекурсивное сравнение нормализованных значений. Порядок массивов значим: для read-моделей
 * он часть контракта (вопросы по позиции, события по времени).
 */
export function diffValues(inprocess: unknown, remote: unknown, path = "$"): ParityDiff[] {
  if (Object.is(inprocess, remote)) return [];
  if (Array.isArray(inprocess) && Array.isArray(remote)) {
    const out: ParityDiff[] = [];
    if (inprocess.length !== remote.length) {
      out.push({ path: `${path}.length`, inprocess: inprocess.length, remote: remote.length });
    }
    for (let i = 0; i < Math.min(inprocess.length, remote.length); i++) out.push(...diffValues(inprocess[i], remote[i], `${path}[${i}]`));
    return out;
  }
  if (isPlainObject(inprocess) && isPlainObject(remote)) {
    const out: ParityDiff[] = [];
    const keys = new Set([...Object.keys(inprocess), ...Object.keys(remote)]);
    for (const key of [...keys].sort()) out.push(...diffValues(inprocess[key], remote[key], `${path}.${key}`));
    return out;
  }
  return [{ path, inprocess, remote }];
}

/** Короткая человекочитаемая строка для лога (без огромных объектов). */
export function describeDiff(diff: ParityDiff, max = 200): string {
  const fmt = (value: unknown) => {
    const text = JSON.stringify(value);
    return (text ?? String(value)).slice(0, max);
  };
  return `${diff.path}: ${fmt(diff.inprocess)} → ${fmt(diff.remote)}`;
}
