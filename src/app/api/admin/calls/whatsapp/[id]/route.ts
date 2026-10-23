import { NextResponse } from "next/server";
import { z } from "zod";
import { api, apiStaff } from "@/server/api";
import { TelephonyError } from "@/modules/telephony";
import { container } from "@/server/container";
import { idParams } from "@/server/input";

const body = z.object({ op: z.enum(["heartbeat", "connected", "hangup", "ended"]), talking: z.boolean().optional() });

/**
 * Живой звонок WhatsApp из панели звонка: «на связи» раз в 15 с, «собеседник ответил», «положить трубку», «звонок кончился».
 * Маршрут, а не server action: при закрытии вкладки трубку кладут sendBeacon и keepalive-запрос (тело — text/plain с тем же JSON).
 */
export const POST = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const staff = await apiStaff(req, "calls.make");
  const { id } = idParams(await params, "id");
  const { op, talking } = body.parse(JSON.parse((await req.text()) || "{}"));
  const calls = container().telephony.whatsapp;
  try {
    switch (op) {
      case "heartbeat":
        return NextResponse.json({ live: await calls.heartbeat(id, staff.user.id, !!talking) });
      case "connected":
        await calls.connected(id, staff.user.id);
        break;
      case "hangup":
      case "ended":
        // Звонок мог кончиться сам (собеседник положил трубку) — hangup тогда только закрывает его в журнале.
        await calls.hangup(id, staff.user.id);
        break;
    }
  } catch (err) {
    if (TelephonyError.is(err)) return NextResponse.json({ error: err.message }, { status: 409 });
    throw err;
  }
  return NextResponse.json({ live: op === "connected" });
});
