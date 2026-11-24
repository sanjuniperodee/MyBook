// next/cache для процессов вне Next (mybook-api, mybook-worker; alias в node-bundle.mjs): серверные действия сайта,
// которые они вызывают, сбрасывают кэш страниц Next — у отдельного процесса этого кэша нет, поэтому сброс ничего не делает.
// Страницы CRM динамические, клиентский кэш роутера живёт 30 с (staleTimes) — правка из приложения видна на сайте сразу.
export function revalidatePath() {}
export function revalidateTag() {}
export function updateTag() {}
export function refresh() {}
export function unstable_noStore() {}
export const unstable_cache = (fn) => fn;
