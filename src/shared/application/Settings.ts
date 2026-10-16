/**
 * Настройки CRM из «Интеграций» (реализация — modules/workspace). Модуль объявляет только свои ключи K: чужих настроек
 * он не видит, а опечатка в ключе не пройдёт проверку типов в корне композиции. Значение — строка с учётом переменных
 * окружения и значений по умолчанию, пусто — не задано; секреты приходят расшифрованными.
 */
export interface SettingsReader<K extends string> {
  get(key: K): Promise<string>;
  getMany<T extends K>(keys: T[]): Promise<Record<T, string>>;
}

/** Настройки, которые модуль ещё и записывает. Пустая строка удаляет значение; actorId — кто изменил (null — система). */
export interface SettingsStore<K extends string> extends SettingsReader<K> {
  save(values: Partial<Record<K, string>>, actorId: string | null): Promise<void>;
}
