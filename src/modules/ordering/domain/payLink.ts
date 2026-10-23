/**
 * Ссылка на оплату счёта из чата: /pay/<token>. Токен — 32 случайных байта base64url (43 знака); всё остальное
 * отсекается регуляркой до запроса в базу (страница, «Я оплатил(а)», роуты Kaspi).
 */
export const PAY_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function isPayToken(raw: unknown): raw is string {
  return typeof raw === "string" && PAY_TOKEN.test(raw);
}

/**
 * Запрос ссылки сборщиком превью мессенджера или поисковым роботом, а не человеком (deals-12): WhatsApp, Telegram,
 * Facebook и Instagram, Slack, Discord, Skype, Viber, VK, поисковики, curl. Иначе «клиент открыл счёт» ставила бы
 * сама отправка ссылки в чат. Пустой User-Agent — тоже не человек.
 */
export function isLinkPreviewAgent(ua: string | null | undefined): boolean {
  if (!ua?.trim()) return true;
  return /whatsapp|telegrambot|facebookexternalhit|facebot|meta-externalagent|instagram.*bot|twitterbot|slackbot|discordbot|skypeuripreview|viber|vkshare|linkedinbot|googlebot|bingbot|yandex(bot|images)|applebot|bot\b|crawler|spider|curl\/|wget\/|python-requests|headlesschrome/i.test(ua);
}

/** Комментарий к платежу в Kaspi по счёту из чата («MyBooks P12»): по нему счёт находят в выписке. */
export const payComment = (label: string) => `MyBooks ${label}`;
