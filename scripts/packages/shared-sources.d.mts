export const BACKEND: RegExp;
export function sharedRoots(root?: string): string[];
export function valueImports(source: string): string[];
export function sharedSources(root?: string): { sources: string[]; violations: string[] };
