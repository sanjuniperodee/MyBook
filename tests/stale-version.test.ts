import { describe, expect, it } from "vitest";
import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";
import { unstable_isUnrecognizedActionError } from "next/navigation";
import { claimStaleReload, isStaleVersionError, RELOAD_GUARD_MS, STALE_RELOAD_KEY, takeStaleReloadHint } from "@/lib/stale-version";
import { clearDraft, DRAFT_MAX_AGE_MS, loadDraft, saveDraft } from "@/lib/form-draft";

/** sessionStorage/localStorage в памяти. */
function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

// 24.11.2026: после каждой выкатки отправка «Новой книги» падала с «Failed to find Server Action» (у вкладки — код прошлой
// сборки), а «Попробовать снова» оставляло вечную заготовку. Такую ошибку распознаём и перезагружаем страницу один раз.
describe("ошибка от прошлой версии страницы", () => {
  it("UnrecognizedActionError Next (клиент) — да, и для unstable_isUnrecognizedActionError тоже", () => {
    const e = new UnrecognizedActionError('Server Action "60448412ab" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action');
    expect(unstable_isUnrecognizedActionError(e)).toBe(true);
    expect(isStaleVersionError(e)).toBe(true);
  });

  it("по тексту: серверное «Failed to find Server Action», пропавший кусок кода прошлой сборки", () => {
    for (const msg of [
      'Failed to find Server Action "60448412". This request might be from an older or newer deployment.',
      'Server Action "abc" was not found on the server.',
      "Loading chunk 123 failed.",
      "Loading CSS chunk app-layout failed",
      "Failed to load chunk /_next/static/chunks/0a1b.js",
      "Failed to fetch dynamically imported module: https://mybooks.kz/_next/static/chunks/x.js",
      "Importing a module script failed.",
    ])
      expect(isStaleVersionError(new Error(msg)), msg).toBe(true);
    const chunk = Object.assign(new Error("x"), { name: "ChunkLoadError" });
    expect(isStaleVersionError(chunk)).toBe(true);
    expect(isStaleVersionError("ChunkLoadError: Loading chunk 7 failed")).toBe(true);
  });

  it("обычные ошибки — нет: их показывает страница ошибки, а не перезагрузка", () => {
    for (const e of [new Error("Не удалось сохранить"), new TypeError("Cannot read properties of undefined"), { digest: "123" }, null, undefined, 42, "сеть"])
      expect(isStaleVersionError(e)).toBe(false);
  });
});

describe("защита от петли перезагрузок", () => {
  it("первая перезагрузка разрешена и отмечена; вторая в течение минуты — нет, после минуты — снова можно", () => {
    const store = memoryStore();
    expect(claimStaleReload(store, 1_000)).toBe(true);
    expect(store.data.has(STALE_RELOAD_KEY)).toBe(true);
    expect(claimStaleReload(store, 1_000 + RELOAD_GUARD_MS - 1)).toBe(false);
    expect(claimStaleReload(store, 1_000 + RELOAD_GUARD_MS + 1)).toBe(true);
  });

  it("подсказка «Обновили страницу» — один раз и только сразу после перезагрузки", () => {
    const store = memoryStore();
    expect(takeStaleReloadHint(store, 0)).toBe(false);
    claimStaleReload(store, 10_000);
    expect(takeStaleReloadHint(store, 12_000)).toBe(true);
    expect(takeStaleReloadHint(store, 13_000)).toBe(false);
    // Подсказка показана, а защита от петли осталась.
    expect(claimStaleReload(store, 14_000)).toBe(false);
    const late = memoryStore();
    claimStaleReload(late, 0);
    expect(takeStaleReloadHint(late, RELOAD_GUARD_MS + 1)).toBe(false);
  });

  it("испорченная отметка или недоступное хранилище — без перезагрузки нельзя гарантировать конец петли", () => {
    const store = memoryStore();
    store.setItem(STALE_RELOAD_KEY, "{oops");
    expect(claimStaleReload(store, 5)).toBe(true);
    const broken = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
    expect(claimStaleReload(broken, 5)).toBe(false);
  });
});

describe("черновик формы", () => {
  it("сохраняется и читается; старше недели и после удаления — нет", () => {
    const store = memoryStore();
    saveDraft(store, "new-book", { title: "Наша история", step: 2 }, 1_000);
    expect(loadDraft(store, "new-book", 2_000)).toEqual({ title: "Наша история", step: 2 });
    expect(loadDraft(store, "new-book", 1_000 + DRAFT_MAX_AGE_MS + 1)).toBeNull();
    clearDraft(store, "new-book");
    expect(loadDraft(store, "new-book", 2_000)).toBeNull();
  });

  it("испорченная запись и переполненное хранилище не ломают форму", () => {
    const store = memoryStore();
    store.setItem("mybook:draft:gift", "not json");
    expect(loadDraft(store, "gift", 0)).toBeNull();
    const full = { ...memoryStore(), setItem: () => { throw new Error("QuotaExceededError"); } };
    expect(() => saveDraft(full, "gift", { a: 1 }, 0)).not.toThrow();
  });
});
