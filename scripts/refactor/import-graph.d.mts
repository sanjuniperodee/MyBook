// Типы для import-graph.mjs (tsconfig без allowJs).
export interface ImportEdge {
  from: string;
  to: string;
  typeOnly: boolean;
  dynamic: boolean;
}

export type Category = "crossModule" | "moduleOutward" | "sharedToModules";

export function importGraph(root: string): { files: string[]; edges: ImportEdge[] };
export const CATEGORIES: ReadonlyArray<readonly [Category, string]>;
export function violations(edges: ImportEdge[]): Record<Category, ImportEdge[]>;
export function edgeLabel(e: ImportEdge): string;
