import { api, apiStaff } from "@/server/api";
import { gowaAudioCallId } from "@/modules/messaging/domain/gowa";
import { container } from "@/server/container";

const deny = (status: number) => new Response(null, { status, headers: { "cache-control": "no-store" } });

/**
 * Пропуск к аудиопотоку звонка WhatsApp для nginx (auth_request в location /wa-call/audio, deploy/nginx-mybook.conf).
 * Браузер сотрудника открывает WebSocket на сайт; nginx спрашивает здесь, можно ли (сессия, право на звонки, звонок —
 * его и ещё идёт), и получает заголовок Authorization к шлюзу — так логин шлюза не попадает ни в браузер, ни в nginx.
 *
 * Ответ с логином шлюза — только на внутренний подзапрос nginx: снаружи адрес закрыт в nginx, а любой запрос через обычный
 * прокси сайта несёт X-Real-IP (его ставит nginx, сам Next — нет; подзапрос его убирает) — такой не обслуживаем вовсе.
 */
export const GET = api(async (req) => {
  if (req.headers.get("x-real-ip") !== null) return deny(404);
  const staff = await apiStaff(req, "calls.make");
  const callId = gowaAudioCallId(req.headers.get("x-original-uri"));
  if (!callId) return deny(400);
  const call = await container().telephony.whatsapp.liveCall(callId);
  if (!call || call.staffId !== staff.user.id) return deny(403);
  const auth = await container().messaging.gowa.authorization();
  return new Response(null, { status: 204, headers: { "cache-control": "no-store", ...(auth ? { "x-gw-authorization": auth } : {}) } });
});
