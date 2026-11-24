import "server-only";
import type { GoogleApi, GoogleEvent, GoogleEventInput } from "../application/GoogleSync";

/**
 * Google OAuth 2.0 и Calendar API v3 запросами fetch (без SDK). Доступ — scope calendar.app.created: приложение видит
 * и меняет только календари, которые создало само («MyBooks CRM»), — не личный календарь сотрудника.
 */
const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const REVOKE = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/calendar/v3";
export const GOOGLE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.app.created"];

export class GoogleHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(url: string, init: RequestInit & { token?: string; json?: unknown } = {}): Promise<T> {
  const { token, json, headers, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try {
      const j = JSON.parse(text) as { error?: { message?: string } | string; error_description?: string };
      msg = typeof j.error === "string" ? `${j.error}: ${j.error_description ?? ""}` : (j.error?.message ?? msg);
    } catch {}
    throw new GoogleHttpError(res.status, msg);
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

const form = (data: Record<string, string>) => ({ method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(data).toString() });

/** Email из id_token (получен напрямую от Google по TLS — подпись не проверяем). */
function emailOf(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8")) as { email?: string };
    return payload.email ?? null;
  } catch {
    return null;
  }
}

export const googleHttp: GoogleApi = {
  authUrl(cfg, state) {
    const q = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: cfg.redirectUri, response_type: "code", scope: GOOGLE_SCOPES.join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "true", state });
    return `${AUTH}?${q}`;
  },
  async exchange(cfg, code) {
    const r = await call<{ access_token: string; refresh_token?: string; expires_in: number; id_token?: string; scope?: string }>(TOKEN, form({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: "authorization_code" }));
    return { accessToken: r.access_token, refreshToken: r.refresh_token ?? null, expiresIn: r.expires_in, email: emailOf(r.id_token), scope: r.scope ?? "" };
  },
  async refresh(cfg, refreshToken) {
    const r = await call<{ access_token: string; expires_in: number }>(TOKEN, form({ refresh_token: refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: "refresh_token" }));
    return { accessToken: r.access_token, expiresIn: r.expires_in };
  },
  async revoke(token) {
    await call(REVOKE, form({ token })).catch(() => {});
  },
  async createCalendar(token, summary) {
    const r = await call<{ id: string }>(`${API}/calendars`, { method: "POST", token, json: { summary, description: "Задачи из CRM MyBooks: название и ссылка на карточку.", timeZone: "Asia/Almaty" } });
    return r.id;
  },
  async calendarExists(token, calendarId) {
    try {
      await call(`${API}/calendars/${encodeURIComponent(calendarId)}`, { token });
      return true;
    } catch (e) {
      if (e instanceof GoogleHttpError && (e.status === 404 || e.status === 410)) return false;
      throw e;
    }
  },
  async deleteCalendar(token, calendarId) {
    await call(`${API}/calendars/${encodeURIComponent(calendarId)}`, { method: "DELETE", token }).catch((e) => {
      if (!(e instanceof GoogleHttpError && (e.status === 404 || e.status === 410))) throw e;
    });
  },
  async upsertEvent(token, calendarId, eventId, ev) {
    const body = toGoogle(ev);
    const q = ev.meet ? "?conferenceDataVersion=1" : "";
    const base = `${API}/calendars/${encodeURIComponent(calendarId)}/events`;
    try {
      const r = eventId ? await call<RawEvent>(`${base}/${encodeURIComponent(eventId)}${q}`, { method: "PATCH", token, json: body }) : await call<RawEvent>(`${base}${q}`, { method: "POST", token, json: body });
      return fromGoogle(r);
    } catch (e) {
      // Событие удалили в Google — создаём заново.
      if (eventId && e instanceof GoogleHttpError && (e.status === 404 || e.status === 410)) return fromGoogle(await call<RawEvent>(`${base}${q}`, { method: "POST", token, json: body }));
      throw e;
    }
  },
  async deleteEvent(token, calendarId, eventId) {
    await call(`${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: "DELETE", token }).catch((e) => {
      if (!(e instanceof GoogleHttpError && (e.status === 404 || e.status === 410))) throw e;
    });
  },
  async changes(token, calendarId, syncToken) {
    const items: GoogleEvent[] = [];
    let pageToken: string | undefined;
    let next: string | null = null;
    do {
      const q = new URLSearchParams({ maxResults: "250", showDeleted: "true", singleEvents: "true", ...(syncToken ? { syncToken } : { timeMin: new Date(Date.now() - 60 * 86_400_000).toISOString() }), ...(pageToken ? { pageToken } : {}) });
      try {
        const r = await call<{ items?: RawEvent[]; nextPageToken?: string; nextSyncToken?: string }>(`${API}/calendars/${encodeURIComponent(calendarId)}/events?${q}`, { token });
        items.push(...(r.items ?? []).map(fromGoogle));
        pageToken = r.nextPageToken;
        next = r.nextSyncToken ?? next;
      } catch (e) {
        // Курсор устарел — полная выборка заново.
        if (syncToken && e instanceof GoogleHttpError && e.status === 410) return { items: [], syncToken: null, reset: true };
        throw e;
      }
    } while (pageToken);
    return { items, syncToken: next, reset: false };
  },
  async watch(token, calendarId, channel) {
    const r = await call<{ resourceId: string; expiration?: string }>(`${API}/calendars/${encodeURIComponent(calendarId)}/events/watch`, { method: "POST", token, json: { id: channel.id, type: "web_hook", address: channel.address, token: channel.token, params: { ttl: String(7 * 24 * 3600) } } });
    return { resourceId: r.resourceId, expiresAt: r.expiration ? new Date(Number(r.expiration)) : new Date(Date.now() + 6 * 86_400_000) };
  },
  async stop(token, channelId, resourceId) {
    await call(`${API}/channels/stop`, { method: "POST", token, json: { id: channelId, resourceId } }).catch(() => {});
  },
};

type RawEvent = {
  id: string;
  status?: string;
  summary?: string;
  updated?: string;
  etag?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  hangoutLink?: string;
  extendedProperties?: { private?: Record<string, string> };
};

function toGoogle(ev: GoogleEventInput) {
  const time = (d: Date) => ({ dateTime: d.toISOString(), timeZone: "Asia/Almaty" });
  const date = (d: Date) => ({ date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(d) });
  const end = ev.allDay ? new Date(ev.start.getTime() + 86_400_000) : ev.end;
  return {
    summary: ev.title,
    description: `Карточка в CRM: ${ev.url}`,
    source: { title: "MyBooks CRM", url: ev.url },
    start: ev.allDay ? date(ev.start) : time(ev.start),
    end: ev.allDay ? date(end) : time(end),
    transparency: ev.done ? "transparent" : "opaque",
    extendedProperties: { private: { mybooksTask: ev.taskId } },
    reminders: ev.remindMin != null && !ev.done ? { useDefault: false, overrides: [{ method: "popup", minutes: Math.min(40_320, ev.remindMin) }] } : { useDefault: false },
    ...(ev.meet ? { conferenceData: { createRequest: { requestId: `mb-${ev.taskId}`, conferenceSolutionKey: { type: "hangoutsMeet" } } } } : {}),
  };
}

function fromGoogle(r: RawEvent): GoogleEvent {
  const parse = (t?: { dateTime?: string; date?: string }) => (t?.dateTime ? { at: new Date(t.dateTime), allDay: false } : t?.date ? { at: new Date(`${t.date}T00:00:00+05:00`), allDay: true } : null);
  const s = parse(r.start);
  const e = parse(r.end);
  return {
    id: r.id,
    cancelled: r.status === "cancelled",
    title: r.summary ?? "",
    start: s?.at ?? null,
    end: e?.at ?? null,
    allDay: !!s?.allDay,
    updated: r.updated ? new Date(r.updated) : null,
    etag: r.etag ?? null,
    taskId: r.extendedProperties?.private?.mybooksTask ?? null,
    meetUrl: r.hangoutLink ?? null,
  };
}
