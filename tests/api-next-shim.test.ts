import { describe, expect, it } from "vitest";
import { NextResponse } from "@/server/http/next-shim";

// В бэкенде на Nest next/server заменён этим файлом (src/server/http/next-shim.ts): обработчики сайта, которые там работают
// (`/r/<код>`, `/go/<ссылка>`, чат сайта), зовут redirect с ResponseInit и ставят cookie в ответе.
describe("next-shim NextResponse", () => {
  it("redirect с ResponseInit: статус, заголовки и cookie", () => {
    const res = NextResponse.redirect(new URL("https://mybooks.kz/kk"), { status: 302, headers: { "Cache-Control": "no-store" } });
    res.cookies.set("mb_invite", "ASEL", { httpOnly: true, sameSite: "lax", maxAge: 60, path: "/" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://mybooks.kz/kk");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.getSetCookie()[0]).toMatch(/^mb_invite=ASEL;.*HttpOnly/i);
  });

  it("redirect числом и по умолчанию 307", () => {
    expect(NextResponse.redirect("https://mybooks.kz/", 302).status).toBe(302);
    expect(NextResponse.redirect("https://mybooks.kz/").status).toBe(307);
  });

  it("json ставит cookie", async () => {
    const res = NextResponse.json({ ok: true }, { status: 201 });
    res.cookies.set("mb_visitor", "t", { httpOnly: true, path: "/" });
    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.getSetCookie()).toHaveLength(1);
    expect(await res.json()).toEqual({ ok: true });
  });
});
