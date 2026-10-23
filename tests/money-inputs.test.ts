import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Поля цены и сумм в тенге (deals-d16): шаг 100 не давал сохранить 9 950 ₸ — браузер отклонял форму.
const files = ["src/app/admin/pricing/PricingForm.tsx", "src/app/admin/clients/new/NewClientForm.tsx", "src/app/admin/deals/new/ClientDealsForm.tsx"];

describe("поля денег принимают любую сумму в тенге", () => {
  it.each(files)("%s — без шага 100", (f) => {
    const src = readFileSync(path.join(__dirname, "..", f), "utf8");
    expect(src).not.toMatch(/step=\{100\}/);
  });
});
