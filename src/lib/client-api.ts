/** fetch-обёртка для клиентских компонентов: JSON, понятные ошибки. */
export async function apiFetch<T = unknown>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: json !== undefined ? { "Content-Type": "application/json", ...headers } : headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new Error("Нет соединения с сервером. Проверьте интернет.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- полный переход на страницу входа
    if (res.status === 401) window.location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
    throw new Error((data as { error?: string }).error ?? `Ошибка ${res.status}`);
  }
  return data as T;
}
