import { NextResponse } from "next/server";
import { api, apiStaff, HttpError } from "@/server/api";
import { TelephonyError } from "@/modules/telephony";
import { container } from "@/server/container";
import { idParams } from "@/server/input";

/** 10 с записи — десятки килобайт; с запасом на Safari (AAC) и паузы сети. */
const MAX_CHUNK = 4 * 1024 * 1024;
const MIMES = new Set(["audio/webm", "audio/mp4", "audio/ogg"]);

/**
 * Кусок записи разговора WhatsApp из панели звонка (MediaRecorder, раз в 10 с): ?seq=номер куска, тело — сам кусок,
 * Content-Type — формат записи браузера. Слушать записи могут только сотрудники с правом calls.recordings.
 */
export const POST = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const staff = await apiStaff(req, "calls.make");
  const { id } = idParams(await params, "id");
  const seq = Number(new URL(req.url).searchParams.get("seq"));
  const mime = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!Number.isInteger(seq) || seq < 0 || seq > 99_999 || !MIMES.has(mime)) throw new HttpError(400, "badRequest");
  const data = new Uint8Array(await req.arrayBuffer());
  if (!data.length || data.length > MAX_CHUNK) throw new HttpError(400, "badRequest");
  try {
    await container().telephony.whatsapp.record(id, staff.user.id, { seq, mime, data });
  } catch (err) {
    if (TelephonyError.is(err)) return NextResponse.json({ error: err.message }, { status: 409 });
    throw err;
  }
  return NextResponse.json({ ok: true });
});
