import { NextResponse } from "next/server";
import { api, apiStaff } from "@/server/api";
import { container } from "@/server/container";
import { staffLabel } from "@/shared/domain/staff";
import { autoShiftOnVisit } from "@/server/shift";
import { mobileLayout } from "@/server/mobile-layout";
import { can } from "@/server/access";

export const dynamic = "force-dynamic";

/** Кто вошёл: имя, роль, права (приложение прячет недоступное), смена и счётчики для бейджей. */
export const GET = api(async (req) => {
  const staff = await apiStaff(req);
  // Открыл приложение в рабочее время — сразу «в сети», как на сайте.
  const onShift = await autoShiftOnVisit(staff);
  const live = await container().reporting.live(staff.context);
  return NextResponse.json({
    id: staff.user.id,
    name: staffLabel(staff.user),
    email: staff.user.email,
    role: staff.roleName,
    isOwner: staff.isOwner,
    scope: staff.scope,
    onShift,
    // Раскладка приложения по правам: набор вкладок и главная (см. server/mobile-layout).
    layout: mobileLayout((p) => can(staff, p), staff.isOwner),
    permissions: [...staff.permissions],
    counters: live.counters,
    unread: live.unread,
  });
});
