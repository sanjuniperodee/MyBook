import { describe, expect, it } from "vitest";
import { navKind, sectionOf } from "@/components/admin/nav-memory";

describe("nav-memory", () => {
  it("раздел по адресу", () => {
    expect(sectionOf("/admin")).toBe("");
    expect(sectionOf("/admin/deals/42?x=1")).toBe("deals");
    expect(sectionOf("/admin/board")).toBe("orders");
  });
  it("направление перехода", () => {
    expect(navKind("/admin/deals", "/admin/deals/42")).toBe("forward");
    expect(navKind("/admin/deals/42", "/admin/deals")).toBe("back");
    expect(navKind("/admin/deals", "/admin/clients")).toBe("tab");
    expect(navKind("/admin", "/admin/chats")).toBe("tab");
    expect(navKind("/admin/team/roles", "/admin/team/plans")).toBe("tab");
    expect(navKind("/admin/deals?mine=1", "/admin/deals?p=2")).toBeNull();
  });
});
