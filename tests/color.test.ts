import { describe, expect, it } from "vitest";
import { hexAlpha } from "@/lib/color";

describe("hexAlpha", () => {
  it("#RRGGBB и прозрачность → rgba(), регистр hex не важен", () => {
    expect(hexAlpha("#0B0907", 0.82)).toBe("rgba(11,9,7,0.82)");
    expect(hexAlpha("#e11d48", 0.18)).toBe("rgba(225,29,72,0.18)");
    expect(hexAlpha("#FFFFFF", 0)).toBe("rgba(255,255,255,0)");
  });
});
