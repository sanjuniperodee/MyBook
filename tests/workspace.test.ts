import { describe, expect, it } from "vitest";
import { CustomFieldsService } from "@/modules/workspace/application";
import { WorkspaceError } from "@/modules/workspace/domain";
import { MemFields } from "./doubles/workspace";

const setup = () => {
  const fields = new MemFields();
  return { fields, svc: new CustomFieldsService(fields) };
};

describe("CustomFieldsService: свои поля сделки и клиента", () => {
  it("новое поле: ключ латиницей из названия, у не-списка варианты не сохраняются", async () => {
    const { fields, svc } = setup();
    await svc.save({ id: null, entity: "deal", label: "Город", type: "text", options: "a, b" });
    expect(fields.last()).toEqual({ id: "field-1", entity: "deal", key: "gorod", label: "Город", type: "text", options: [] });
    await svc.save({ id: null, entity: "client", label: "Қала", type: "text", options: "" });
    await svc.save({ id: null, entity: "deal", label: "Повод / событие", type: "date", options: "" });
    await svc.save({ id: null, entity: "deal", label: "!!!", type: "checkbox", options: "" });
    // ь и ъ не транслитерируются и становятся разделителем — так оставлено: смена транслитерации поменяла бы ключи новых полей (B12)
    await svc.save({ id: null, entity: "deal", label: "Подъезд", type: "number", options: "" });
    expect([...fields.rows.values()].map((f) => f.key)).toEqual(["gorod", "qala", "povod_sobytie", "field", "pod_ezd"]);
  });

  it("ключ уникален в рамках сущности: повтор получает _2, _3; у другой сущности — свой счёт", async () => {
    const { fields, svc } = setup();
    for (const entity of ["deal", "deal", "deal", "client"] as const) await svc.save({ id: null, entity, label: "Дата свадьбы", type: "date", options: "" });
    expect([...fields.rows.values()].map((f) => `${f.entity}:${f.key}`)).toEqual(["deal:data_svad_by", "deal:data_svad_by_2", "deal:data_svad_by_3", "client:data_svad_by"]);
    // название с числом на конце: суффикс заменяет число, а не дописывается
    await svc.save({ id: null, entity: "deal", label: "Размер 2", type: "text", options: "" });
    await svc.save({ id: null, entity: "deal", label: "Размер 2", type: "text", options: "" });
    expect(fields.last().key).toBe("razmer_3");
  });

  it("список: варианты через запятую или строку, без пустых и повторов (без учёта регистра), до 30 штук по 60 символов", async () => {
    const { fields, svc } = setup();
    await svc.save({ id: null, entity: "deal", label: "Повод", type: "select", options: " Да , нет,да,\n, Да ,Может быть" });
    // «Да» и «да» — один вариант, остаётся первый (B12)
    expect(fields.last().options).toEqual(["Да", "нет", "Может быть"]);
    const many = Array.from({ length: 35 }, (_, i) => `${i}`.padEnd(70, "x")).join(",");
    await svc.save({ id: null, entity: "deal", label: "Много", type: "select", options: many });
    expect(fields.last().options).toHaveLength(30);
    expect(fields.last().options.every((o) => o.length === 60)).toBe(true);
  });

  it("список меньше чем из двух вариантов — fieldOptions с текстом для сотрудника, ничего не записано", async () => {
    const { fields, svc } = setup();
    for (const options of ["", "Да", "Да, Да", " , \n"]) {
      const err = await svc.save({ id: null, entity: "deal", label: "Повод", type: "select", options }).catch((e: unknown) => e);
      expect(WorkspaceError.is(err)).toBe(true);
      expect(err).toMatchObject({ code: "fieldOptions", message: "У списка должно быть хотя бы 2 варианта (через запятую)" });
    }
    expect(fields.rows.size).toBe(0);
    expect(fields.keyLookups).toBe(0);
  });

  it("правка: меняются название, тип и варианты, ключ остаётся; неверный список не сохраняется", async () => {
    const { fields, svc } = setup();
    await svc.save({ id: null, entity: "deal", label: "Повод", type: "select", options: "Свадьба, Юбилей" });
    await svc.save({ id: "field-1", entity: "deal", label: "Событие", type: "text", options: "Свадьба, Юбилей" });
    expect(fields.rows.get("field-1")).toEqual({ id: "field-1", entity: "deal", key: "povod", label: "Событие", type: "text", options: [] });
    await expect(svc.save({ id: "field-1", entity: "deal", label: "Событие", type: "select", options: "один" })).rejects.toMatchObject({ code: "fieldOptions" });
    expect(fields.rows.get("field-1")?.type).toBe("text");
    // при правке занятые ключи не запрашиваются
    expect(fields.keyLookups).toBe(1);
  });

  it("удаление возвращает название поля; нет поля — null", async () => {
    const { fields, svc } = setup();
    await svc.save({ id: null, entity: "client", label: "Город", type: "text", options: "" });
    expect(await svc.delete("field-1")).toEqual({ label: "Город" });
    expect(await svc.delete("field-1")).toBeNull();
    expect(fields.rows.size).toBe(0);
  });
});
