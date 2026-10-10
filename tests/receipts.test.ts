import { describe, expect, it } from "vitest";
import { RECEIPT_MAX_BYTES, safeReceiptName, sniffReceipt } from "@/modules/sales/domain";

const bytes = (...b: number[]) => Uint8Array.from([...b, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

describe("чек об оплате", () => {
  it("тип файла определяется по содержимому", () => {
    expect(sniffReceipt(bytes(0xff, 0xd8, 0xff, 0xe0))).toEqual({ ext: "jpg", mime: "image/jpeg" });
    expect(sniffReceipt(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toEqual({ ext: "png", mime: "image/png" });
    expect(sniffReceipt(bytes(0x25, 0x50, 0x44, 0x46, 0x2d))).toEqual({ ext: "pdf", mime: "application/pdf" });
    const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0]);
    expect(sniffReceipt(webp)).toEqual({ ext: "webp", mime: "image/webp" });
  });

  it("подмена расширения и опасные файлы не проходят", () => {
    expect(sniffReceipt(new TextEncoder().encode("<html><script>alert(1)</script></html>"))).toBeNull();
    expect(sniffReceipt(new TextEncoder().encode("MZ\u0090\u0000 exe"))).toBeNull();
    expect(sniffReceipt(new Uint8Array())).toBeNull();
    // svg может содержать скрипты — не принимаем
    expect(sniffReceipt(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
  });

  it("имя для показа: без путей и мусора", () => {
    expect(safeReceiptName("C:\\Users\\a\\чек kaspi.jpg", "jpg")).toBe("чек kaspi.jpg");
    expect(safeReceiptName("../../etc/passwd", "jpg")).toBe("passwd");
    expect(safeReceiptName('a<b>"c"?.png', "png")).toBe("abc.png");
    expect(safeReceiptName("", "pdf")).toBe("чек.pdf");
    expect(safeReceiptName("x".repeat(300), "jpg")).toHaveLength(120);
    expect(RECEIPT_MAX_BYTES).toBe(12 * 1024 * 1024);
  });
});
