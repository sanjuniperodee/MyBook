import type { CustomFieldDef, CustomFieldEntity } from "../domain/customFields";

/** Свои поля сделки и клиента только для чтения (настраиваются в modules/workspace; переменные шаблонов — fieldVars). */
export interface CustomFieldsReader {
  /** Поля сущности в порядке показа. */
  list(entity: CustomFieldEntity): Promise<CustomFieldDef[]>;
}
