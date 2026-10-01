import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { users } from "@/lib/db/schema";
import { executor } from "@/shared/infrastructure/database";
import type { PeopleGateway } from "../../application/ports";

export class DrizzlePeopleGateway implements PeopleGateway {
  async rememberPhoneIfMissing(userId: string, phone: string) {
    await executor().update(users).set({ phone }).where(and(eq(users.id, userId), isNull(users.phone)));
  }

  async staffLabel(userId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
    const [u] = await executor().select({ name: users.name, email: users.email, role: users.role, disabled: users.staffDisabled }).from(users).where(eq(users.id, userId)).limit(1);
    return u && u.role === "admin" && !u.disabled ? u.name || u.email : null;
  }
}
