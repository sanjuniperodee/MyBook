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

// Пустой обработчик fetch нужен браузерам, чтобы предложить «Установить приложение».
self.addEventListener("fetch", () => {});
