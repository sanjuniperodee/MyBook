export function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]) {
  // BOM + точка с запятой — Excel с русской локалью открывает такой файл корректно.
  return "﻿" + [header, ...rows].map((r) => r.map(csvEscape).join(";")).join("\r\n") + "\r\n";
}
