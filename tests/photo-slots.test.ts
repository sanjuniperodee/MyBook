import { describe, expect, it } from "vitest";
import { designBack } from "@/lib/book/cover-back";
import { coverPhotoSlots, getCoverTemplate, pickerCovers } from "@/lib/book/covers";
import { coverSpreadGeometry, getFormat } from "@/lib/book/formats";
import { backSlotBoxes, frontSlotBoxes } from "@/lib/book/photo-slots";
import { photoImage } from "@/lib/book/cover-kit";

const a5 = getFormat("a5");

describe("места под фото на обложке", () => {
  it("каждый шаблон с фото сообщает столько мест, сколько заявлено, и все они внутри обложки", () => {
    const withPhotos = pickerCovers().filter((t) => getCoverTemplate(t.id).requiresPhoto);
    expect(withPhotos.length).toBeGreaterThan(3);
    for (const t of withPhotos) {
      const template = getCoverTemplate(t.id);
      const boxes = frontSlotBoxes(template, a5);
      expect(boxes.length, t.id).toBe(coverPhotoSlots(template));
      for (const b of boxes) {
        expect(b.w, t.id).toBeGreaterThan(0.03);
        expect(b.h, t.id).toBeGreaterThan(0.03);
        expect(b.x, t.id).toBeGreaterThanOrEqual(-0.01);
        expect(b.y, t.id).toBeGreaterThanOrEqual(-0.01);
        expect(b.x + b.w, t.id).toBeLessThanOrEqual(1.01);
        expect(b.y + b.h, t.id).toBeLessThanOrEqual(1.01);
      }
    }
  });

  it("оборот: места под снимки — внутри карточек, с учётом полей", () => {
    const template = getCoverTemplate(pickerCovers()[0].id);
    const back = coverSpreadGeometry(a5, 120).back!;
    const content = { text: "", signature: "Алия", names: "Алия & Марғұлан", year: 2026, photos: [{ width: 3000, height: 2000 }, { width: 2000, height: 3000 }, { width: 3000, height: 3000 }] };
    const polaroids = designBack(template, back.w, back.h, { ...content, layout: "polaroids" });
    const boxes = backSlotBoxes(polaroids, back.w, back.h);
    expect(boxes.map((b) => b.slot).sort()).toEqual([0, 1, 2]);
    for (const b of boxes) expect(b.x + b.w).toBeLessThanOrEqual(1);
    const full = backSlotBoxes(designBack(template, back.w, back.h, { ...content, layout: "fullPhoto" }), back.w, back.h);
    expect(full).toEqual([{ slot: 0, x: 0, y: 0, w: 1, h: 1, rotate: undefined, origin: { x: 0.5, y: 0.5 } }]);
    expect(backSlotBoxes(designBack(template, back.w, back.h, { ...content, layout: "quote" }), back.w, back.h)).toEqual([]);
  });

  it("SVG: кадр рисуется вложенным svg, без кадра — прежний <image slice>", () => {
    const plain = photoImage("data:image/jpeg;base64,AAA", { x: 10, y: 20, w: 100, h: 50 });
    expect(plain).toContain('preserveAspectRatio="xMidYMid slice"');
    expect(plain).not.toContain("<svg");
    const framed = photoImage({ href: "data:image/jpeg;base64,AAA", width: 4000, height: 2000, frame: { zoom: 2, x: 0, y: 0.5 } }, { x: 10, y: 20, w: 100, h: 50 });
    expect(framed).toContain('<svg x="10" y="20" width="100" height="50" viewBox="0 0 100 50"');
    expect(framed).toContain('preserveAspectRatio="none"');
    // zoom 2 при кадре 2:1 в 100×50: высота снимка 100, ширина 200, прижат слева (x=0), по вертикали по центру → y = (50−100)/2
    expect(framed).toContain('x="0" y="-25" width="200" height="100"');
    // без размеров или с кадром по умолчанию — обычный вид
    expect(photoImage({ href: "x", frame: { zoom: 2, x: 0, y: 0 } }, { x: 0, y: 0, w: 1, h: 1 })).toContain("slice");
    expect(photoImage({ href: "x", width: 10, height: 10, frame: { zoom: 1, x: 0.5, y: 0.5 } }, { x: 0, y: 0, w: 1, h: 1 })).toContain("slice");
  });
});
