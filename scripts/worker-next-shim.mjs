// Заглушка next/server, next/headers, next/navigation для процесса mybook-worker (scripts/build-worker.mjs).
// Их импортируют модули, общие с сайтом (auth, access, api), но фоновые проходы их не вызывают: вне HTTP-запроса Next
// их и так не поддерживает. Любой вызов — понятная ошибка. after() бросает, как Next вне запроса, — и runInBackground
// (src/shared/infrastructure/background.ts) выполняет задачу сразу.
const unavailable = (name) =>
  function () {
    throw new Error(`${name}() недоступен в mybook-worker: это вызов из HTTP-запроса`);
  };
export const after = unavailable("after");
export const connection = unavailable("connection");
export const cookies = unavailable("cookies");
export const headers = unavailable("headers");
export const draftMode = unavailable("draftMode");
export const redirect = unavailable("redirect");
export const permanentRedirect = unavailable("permanentRedirect");
export const notFound = unavailable("notFound");
export const forbidden = unavailable("forbidden");
export const unauthorized = unavailable("unauthorized");
export const useRouter = unavailable("useRouter");
export const usePathname = unavailable("usePathname");
export const useSearchParams = unavailable("useSearchParams");
export const userAgent = unavailable("userAgent");
export class NextRequest {
  constructor() {
    throw new Error("NextRequest недоступен в mybook-worker");
  }
}
export class NextResponse {
  constructor() {
    throw new Error("NextResponse недоступен в mybook-worker");
  }
  static json = unavailable("NextResponse.json");
  static redirect = unavailable("NextResponse.redirect");
  static rewrite = unavailable("NextResponse.rewrite");
  static next = unavailable("NextResponse.next");
}
export const RedirectType = { push: "push", replace: "replace" };
