import { requireStaff } from "@/server/access";
import { formatDate } from "@/lib/dates";
import { StaffBoard, type Member } from "../TeamControls";
import { crmRead } from "@/server/v1-local-bridge-crm";

export const metadata = { title: "Команда" };

export default async function AdminTeam() {
  const staff = await requireStaff("team.manage");
  const { roles, members } = await crmRead("pages.team", {});
  const ownerRole = roles.find((r) => r.key === "owner");
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const inviteRoles = roles.filter((r) => r.key !== "owner" || staff.isOwner).map((r) => ({ id: r.id, name: r.name }));

  const list: Member[] = members.map(({ user: u, openDeals, calls7d }) => {
    const roleId = u.crmRoleId ?? ownerRole?.id ?? "";
    const isOwner = !u.crmRoleId || u.crmRoleId === ownerRole?.id;
    const isSelf = u.id === staff.user.id;
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      roleId,
      roleName: roleName.get(roleId) ?? "",
      extension: u.sipExtension ?? "",
      phone: u.phone ?? "",
      disabled: u.staffDisabled,
      onShift: u.onShift,
      lastSeen: u.lastSeenAt ? formatDate(u.lastSeenAt, true) : null,
      openDeals,
      calls7d,
      isSelf,
      locked: isSelf || (isOwner && !staff.isOwner),
    };
  });
  return <StaffBoard members={list} roles={roles.map((r) => ({ id: r.id, name: r.name }))} inviteRoles={inviteRoles} />;
}
