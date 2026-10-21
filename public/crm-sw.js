// Service worker CRM: push-уведомления сотрудникам (даже при закрытой вкладке) и установка как приложения.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : "MyBooks CRM" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "MyBooks CRM", {
      body: data.body || "",
      icon: "/crm-icon-192.png",
      badge: "/crm-icon-192.png",
      tag: data.tag || undefined,
      data: { link: data.link || "/admin" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/admin";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).pathname.startsWith("/admin") && "focus" in c) {
          c.navigate(link);
          return c.focus();
        }
      }
      return self.clients.openWindow(link);
    }),
  );
});

// Офлайн: кэшируем только оболочку — статику Next (имена с хешем, одинаковы для всех) и страницу «нет связи».
// Страницы CRM и ответы API не кэшируем: там данные сотрудника и доступы, без сети они просто не откроются.
const SHELL_CACHE = "crm-shell-v1";
const SHELL_ASSETS = ["/crm-offline.html", "/crm-icon-192.png", "/crm-icon-512.png", "/crm.webmanifest"];

self.addEventListener("install", (event) => {
  // Ошибка кэша не должна ломать установку воркера: без него пуши всё равно работают.
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {}));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("crm-shell-") && key !== SHELL_CACHE).map((key) => caches.delete(key)))),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Статика Next с хешем в имени: из кэша, если уже скачана.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(SHELL_CACHE).then((cache) => cache.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  // Переход на страницу: сеть в первую очередь, без сети — страница «нет связи».
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/crm-offline.html")));
  }
});
