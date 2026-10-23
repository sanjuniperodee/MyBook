import { api, apiStaff } from "@/server/api";
import { audit, canSeeAssigned } from "@/server/access";
import { gowaAudioCallId } from "@/modules/messaging/domain/gowa";
import { container } from "@/server/container";

const deny = (status: number) => new Response(null, { status, headers: { "cache-control": "no-store" } });

/**
 * Пропуск к прослушке идущего звонка WhatsApp для nginx (auth_request в location /wa-call/listen,
 * deploy/nginx-wa-call.conf). Слушать может только сотрудник с правом «Слушать записи разговоров» (руководитель), чужой
 * звонок в пределах того, что ему видно, и только разговор (ответили, ещё идёт). Шлюз отдаёт слушателю копию обеих
 * сторон и ничего не принимает от него — вмешаться в разговор нельзя. Каждое подключение — в журнале действий.
 *
 * Как и у пропуска к звуку звонка: снаружи адрес закрыт в nginx, запрос через прокси сайта несёт X-Real-IP — отказ.
 */
export const GET = api(async (req) => {
  if (req.headers.get("x-real-ip") !== null) return deny(404);
  const staff = await apiStaff(req, "calls.view", "calls.recordings");
  const callId = gowaAudioCallId(req.headers.get("x-original-uri"));
  if (!callId) return deny(400);
  const call = await container().telephony.whatsapp.liveCall(callId);
  if (!call || !call.answered || call.staffId === staff.user.id || !canSeeAssigned(staff, call.staffId)) return deny(403);
  await audit(staff, "call.listen", "call", call.id, { phone: call.clientPhone });
  const auth = await container().messaging.gowa.authorization();
  return new Response(null, { status: 204, headers: { "cache-control": "no-store", "x-wa-call-id": callId, ...(auth ? { "x-gw-authorization": auth } : {}) } });
});
