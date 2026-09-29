import type { Gender } from "../db/schema";

/**
 * Подставляет формы рода в шаблон.
 *  {увидел|увидела} — зависит от рода автора книги;
 *  [он|она]         — зависит от рода адресата (того, кому дарят книгу).
 * Первая форма — мужская, вторая — женская. Допускается пустая форма: «сказал[|а]».
 */
export function applyGender(template: string, author: Gender, recipient: Gender): string {
  return template
    .replace(/\{([^{}|]*)\|([^{}|]*)\}/g, (_, m: string, f: string) => (author === "m" ? m : f))
    .replace(/\[([^[\]|]*)\|([^[\]|]*)\]/g, (_, m: string, f: string) => (recipient === "m" ? m : f));
}
