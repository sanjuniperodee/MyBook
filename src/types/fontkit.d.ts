/** fontkit — разбор шрифтов (им же пользуется react-pdf); нам нужен только create из байтов файла. */
declare module "fontkit" {
  export function create(buffer: Buffer | Uint8Array, postscriptName?: string): unknown;
}
