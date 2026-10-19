import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Поля «Бюджет» и «Источник» в карточке сделки (P0-3, ревью): их меняет не только эта форма — счёт из чата записывает
// в сделку сумму договорённости и обновляет страницу (router.refresh()). Форма должна отправить новое значение с сервера,
// а не то, что было при открытии карточки. DOM в тестах нет, поэтому одна и та же форма перерисовывается вызовом
// компонента: состояние хуков переживает перерисовку, как в React, а поле ведёт себя как узел DOM — управляемое берёт
// value, неуправляемое хранит набранное, пока React его не пересоздал (сменился key).

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], next: 0 }));
vi.mock("react", async (importOriginal) => {
  const real = await importOriginal<typeof import("react")>();
  const useState = (init: unknown) => {
    const k = hooks.next++;
    if (!(k in hooks.slots)) hooks.slots[k] = typeof init === "function" ? (init as () => unknown)() : init;
    const set = (v: unknown) => void (hooks.slots[k] = typeof v === "function" ? (v as (p: unknown) => unknown)(hooks.slots[k]) : v);
    return [hooks.slots[k], set];
  };
  return { ...real, useState, useActionState: (_action: unknown, init: unknown) => [init, () => {}, false] };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
vi.mock("@/app/admin/deals/actions", () => ({ updateDealAction: vi.fn() }));
vi.mock("@/app/admin/crm-actions", () => ({}));

const { DealFields, draftValue } = await import("@/app/admin/deals/[id]/DealControls");
const { DiscountHint } = await import("@/components/admin/DiscountHint");

type Props = Parameters<typeof DealFields>[0];
const deal = (over: Partial<Props["deal"]> = {}): Props["deal"] => ({ id: "d1", title: "Книга маме", amount: 0, source: "whatsapp", contactName: "Айгерим", contactPhone: "", contactEmail: "", extraPhones: [], tags: [], ...over });

function all(node: ReactNode, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) node.forEach((n) => all(n, out));
  else if (isValidElement(node)) {
    out.push(node);
    all((node.props as { children?: ReactNode }).children, out);
  }
  return out;
}

/** Одна форма на странице: перерисовки сохраняют её состояние и узлы полей. */
function mountForm() {
  const nodes = new Map<string, { key: string | null; value: string }>();
  let tree: ReactElement[] = [];
  const field = (name: string) => tree.find((e) => (e.props as { name?: string }).name === name)!;
  const render = (props: Props) => {
    hooks.next = 0;
    tree = all(DealFields(props) as ReactElement);
    for (const name of ["amount", "source"]) {
      const el = field(name);
      const p = el.props as { value?: string; defaultValue?: string };
      const node = nodes.get(name);
      if (p.value !== undefined) nodes.set(name, { key: el.key, value: String(p.value) });
      else if (!node || node.key !== el.key) nodes.set(name, { key: el.key, value: String(p.defaultValue) });
    }
  };
  return {
    render,
    /** Сотрудник набрал значение: узел его хранит, форма узнаёт через onChange. */
    type(name: string, value: string) {
      nodes.get(name)!.value = value;
      (field(name).props as { onChange: (e: { target: { value: string } }) => void }).onChange({ target: { value } });
    },
    /** Что уйдёт на сервер по «Сохранить». */
    submitted: (name: string) => nodes.get(name)!.value,
    hintPrice: () => (tree.find((e) => e.type === DiscountHint)?.props as { price: number } | undefined)?.price,
    reset: () => (tree[0].props as { onReset: () => void }).onReset(),
  };
}

beforeEach(() => {
  hooks.slots = [];
  hooks.next = 0;
});

describe("Карточка сделки: бюджет и источник после обновления страницы", () => {
  it("счёт из чата записал 28 000 в сделку с бюджетом 0 — «Сохранить» отправит 28 000, а не 0 с открытия карточки", () => {
    const form = mountForm();
    form.render({ deal: deal({ amount: 0 }), masked: null, disabled: false, pricing: { plan: null, maxPercent: 15 } });
    expect(form.submitted("amount")).toBe("0");
    form.render({ deal: deal({ amount: 28_000 }), masked: null, disabled: false, pricing: { plan: "hardcover", maxPercent: 15 } });
    expect(form.submitted("amount")).toBe("28000");
    expect(form.hintPrice()).toBe(28_000);
  });

  it("источник сменили не здесь (счёт поставил «вручную») — уйдёт новый источник", () => {
    const form = mountForm();
    form.render({ deal: deal({ source: "whatsapp" }), masked: null, disabled: false });
    form.render({ deal: deal({ source: "manual" }), masked: null, disabled: false });
    expect(form.submitted("source")).toBe("manual");
  });

  it("набранное, пока сумма на сервере та же, — уходит и видно в подсказке; сервер сменил сумму — действует новая", () => {
    const form = mountForm();
    const props = (amount: number): Props => ({ deal: deal({ amount, source: "manual" }), masked: null, disabled: false, pricing: { plan: "hardcover", maxPercent: 15 } });
    form.render(props(30_000));
    form.type("amount", "26000");
    form.render(props(30_000));
    expect(form.submitted("amount")).toBe("26000");
    expect(form.hintPrice()).toBe(26_000);
    form.render(props(28_000));
    expect(form.submitted("amount")).toBe("28000");
    expect(form.hintPrice()).toBe(28_000);
  });

  it("после сохранения React сбрасывает форму — подсказка снова по сумме с сервера", () => {
    const form = mountForm();
    const props: Props = { deal: deal({ amount: 30_000, source: "manual" }), masked: null, disabled: false, pricing: { plan: "hardcover", maxPercent: 15 } };
    form.render(props);
    form.type("amount", "20000");
    form.render(props);
    expect(form.hintPrice()).toBe(20_000);
    form.reset();
    form.render(props);
    expect(form.hintPrice()).toBe(30_000);
  });

  it("draftValue: набранное действует, пока на сервере значение, от которого начинали", () => {
    expect(draftValue(null, "0")).toBe("0");
    expect(draftValue({ from: "0", value: "5000" }, "0")).toBe("5000");
    expect(draftValue({ from: "0", value: "5000" }, "28000")).toBe("28000");
  });
});
