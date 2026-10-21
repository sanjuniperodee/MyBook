import { NextResponse } from "next/server";
import { api, apiStaff } from "@/server/api";
import { container } from "@/server/container";
import { staffLabel } from "@/shared/domain/staff";

export const dynamic = "force-dynamic";

/** Кто вошёл: имя, роль, права (приложение прячет недоступное), смена и счётчики для бейджей. */
export const GET = api(async (req) => {
  const staff = await apiStaff(req);
  const live = await container().reporting.live(staff.context);
  return NextResponse.json({
    id: staff.user.id,
    name: staffLabel(staff.user),
    email: staff.user.email,
    role: staff.roleName,
    isOwner: staff.isOwner,
    scope: staff.scope,
    onShift: staff.user.onShift,
    permissions: [...staff.permissions],
    counters: live.counters,
    unread: live.unread,
  });
});
