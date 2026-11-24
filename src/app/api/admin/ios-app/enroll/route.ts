import { env } from "@/config/env";
import { api, apiStaff } from "@/server/api";
import { enrollProfile, iosToken } from "@/server/ios-app";

export const dynamic = "force-dynamic";

/** Профиль регистрации iPhone (открывать в Safari на самом телефоне): телефон пришлёт CRM свой UDID. Сутки на установку. */
export const GET = api(async (req) => {
  const staff = await apiStaff(req);
  const profile = enrollProfile(env.appUrl.replace(/\/+$/, ""), iosToken(staff.user.id, "enroll", 24 * 3600));
  return new Response(profile, {
    headers: { "Content-Type": "application/x-apple-aspen-config", "Content-Disposition": 'attachment; filename="crm-iphone.mobileconfig"', "Cache-Control": "private, no-store" },
  });
});
