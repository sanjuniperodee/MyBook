export const env = {
  appUrl: (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  storageDir: process.env.STORAGE_DIR ?? "./storage",
  adminEmails: (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  paymentProvider: (process.env.PAYMENT_PROVIDER ?? "manual") as "manual" | "cloudpayments",
  cloudpayments: {
    publicId: process.env.CLOUDPAYMENTS_PUBLIC_ID ?? "",
    apiSecret: process.env.CLOUDPAYMENTS_API_SECRET ?? "",
  },
  ordersNotifyEmail: process.env.ORDERS_NOTIFY_EMAIL ?? "",
  /** Дополнительные хосты, с которых сервер вправе скачивать вложения чатов по ссылке канала (к Wazzup), через запятую. */
  chatMediaHosts: (process.env.CHAT_MEDIA_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter((h) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h)),
};

export const isSecureCookie = env.appUrl.startsWith("https://");
